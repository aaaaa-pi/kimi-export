// 后台服务脚本 - 自动模式专用版（支持popup状态恢复）
chrome.runtime.onInstalled.addListener(() => {
  console.log('Kimi自动采集器已安装');
  // 注意：不自动清理storage，保留用户状态
  // chrome.storage.local.clear();
});

// 任务管理器
const TaskManager = {
  async saveTaskState(taskId, state) {
    try {
      await chrome.storage.local.set({
        [`task_${taskId}`]: {
          ...state,
          lastUpdated: Date.now()
        }
      });
      console.log(`任务状态已保存: ${taskId}`, state);
    } catch (error) {
      console.error('保存任务状态失败:', error);
    }
  },

  async getTaskState(taskId) {
    try {
      const result = await chrome.storage.local.get([`task_${taskId}`]);
      return result[`task_${taskId}`] || null;
    } catch (error) {
      console.error('获取任务状态失败:', error);
      return null;
    }
  },

  async getActiveTasks() {
    try {
      const result = await chrome.storage.local.get(null);
      const activeTasks = {};
      
      for (const [key, value] of Object.entries(result)) {
        if (key.startsWith('task_') && (value.status === 'running' || value.status === 'waiting')) {
          activeTasks[key.replace('task_', '')] = value;
        }
      }
      
      return activeTasks;
    } catch (error) {
      console.error('获取活跃任务失败:', error);
      return {};
    }
  },

  async clearTask(taskId) {
    try {
      await chrome.storage.local.remove([`task_${taskId}`]);
      console.log(`任务状态已清理: ${taskId}`);
    } catch (error) {
      console.error('清理任务状态失败:', error);
    }
  },

  generateTaskId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

// 自动下载管理器
const DownloadManager = {
  generateQAWithSourcesCSV(data) {
    // 🔥 修改：添加了"文章引用时间"列
    let csv = '问题,AI输出的答案,文件名,序号,标题,内容,网站,网站url,文章引用时间\n';
    
    if (data && data.length > 0) {
      data.forEach((row) => {
        csv += `"${this.escapeCsvValue(row.问题)}","${this.escapeCsvValue(row.AI输出的答案)}","${this.escapeCsvValue(row.文件名)}","${this.escapeCsvValue(row.序号)}","${this.escapeCsvValue(row.标题)}","${this.escapeCsvValue(row.内容)}","${this.escapeCsvValue(row.网站)}","${this.escapeCsvValue(row.网站url)}","${this.escapeCsvValue(row.文章引用时间)}"\n`;
      });
    }
    
    return csv;
  },

  escapeCsvValue(value) {
    if (!value) return '';
    return value.toString().replace(/"/g, '""');
  },

  async downloadCSV(csvContent, filename) {
    try {
      console.log(`📝 准备下载文件: ${filename}`);
      
      // 添加BOM以支持Excel正确显示中文
      const csvWithBOM = '\uFEFF' + csvContent;
      
      // 使用更简单可靠的编码方式
      const encodedCsv = encodeURIComponent(csvWithBOM);
      const dataUrl = `data:text/csv;charset=utf-8,${encodedCsv}`;
      
      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      });
      
      console.log(`✅ 文件下载成功: ${filename}, downloadId: ${downloadId}`);
      return downloadId;
      
    } catch (error) {
      console.error('💥 下载文件失败:', error);
      throw new Error(`下载失败: ${error.message}`);
    }
  }
};

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('kimi.com')) {
    console.log('Kimi页面加载完成');
  }
});

// 防止重复处理的任务集合
let processingTasks = new Set();

// 停止任务的集合
let stoppingTasks = new Set();

// 监听来自content script和popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background收到消息:', request);

  if (request.action === 'contentScriptReady') {
    console.log('Content script准备就绪');
    sendResponse({ success: true });
  }
  
  // 任务开始
  else if (request.action === 'taskStart') {
    const { taskId, type, tabId } = request;
    
    // 确保任务不在停止列表中
    stoppingTasks.delete(taskId);
    
    // 自动收集任务状态为running
    const taskStatus = type === 'autoCollection' ? 'running' : 'waiting';
    
    TaskManager.saveTaskState(taskId, {
      status: taskStatus,
      type: type,
      tabId: tabId,
      startTime: Date.now(),
      progress: { current: 0, total: 0 },
      data: null
    });
    
    console.log(`任务开始: ${taskId}, 类型: ${type}, 状态: ${taskStatus}`);
    sendResponse({ success: true });
  }
  
  // 任务进度更新
  else if (request.action === 'taskProgress') {
    const { taskId, progress } = request;
    
    // 检查任务是否正在停止
    if (stoppingTasks.has(taskId)) {
      console.log(`⚠️ 任务 ${taskId} 正在停止，忽略进度更新`);
      sendResponse({ success: false, message: '任务正在停止' });
      return false;
    }
    
    TaskManager.getTaskState(taskId).then(currentState => {
      if (currentState) {
        TaskManager.saveTaskState(taskId, {
          ...currentState,
          progress: progress
        });
        console.log(`任务进度更新: ${taskId}`, progress);
      }
    });
    
    sendResponse({ success: true });
  }
  
  // 任务完成
  else if (request.action === 'taskComplete') {
    const { taskId, success, data, error, isStopExport, stopExportInfo } = request;
    
    // 检查任务是否正在停止
    if (stoppingTasks.has(taskId)) {
      console.log(`⚠️ 任务 ${taskId} 正在停止，忽略完成通知`);
      sendResponse({ success: false, message: '任务正在停止' });
      return false;
    }
    
    // 防重复处理检查
    if (processingTasks.has(taskId)) {
      console.log(`⚠️ 任务 ${taskId} 已在处理中，忽略重复请求`);
      sendResponse({ success: false, error: '任务正在处理中' });
      return false;
    }
    
    // 标记任务为处理中
    processingTasks.add(taskId);
    
    // 🔥 区分完成导出和停止导出的日志
    if (isStopExport) {
      console.log(`🛑 收到停止导出通知: taskId=${taskId}, success=${success}`);
      if (stopExportInfo) {
        console.log(`📊 停止导出数据信息: ${stopExportInfo.questionsCount} 个问答对，${stopExportInfo.totalRecords} 条记录`);
      }
    } else {
      console.log(`📋 任务完成通知: taskId=${taskId}, success=${success}`);
    }
    
    if (data) {
      console.log(`📊 数据长度: ${Array.isArray(data) ? data.length : 'N/A'}`);
    }
    if (error) {
      console.log(`❌ 错误信息: ${error}`);
    }
    
    TaskManager.getTaskState(taskId).then(async currentState => {
      try {
        if (currentState) {
          console.log(`📋 找到任务状态:`, currentState);
          
          if (success && data) {
            // 在background中下载文件
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            
            // 🔥 根据导出类型生成不同的文件名
            let filename;
            if (isStopExport) {
              filename = `Kimi停止导出数据_${timestamp}.csv`;
            } else {
              filename = `Kimi自动问答数据_${timestamp}.csv`;
            }
            
            const csvContent = DownloadManager.generateQAWithSourcesCSV(data);
            
            console.log(`📝 生成CSV文件: ${filename}`);
            console.log(`💾 开始下载文件: ${filename}`);
            
            try {
              const downloadId = await DownloadManager.downloadCSV(csvContent, filename);
              console.log(`✅ 文件下载启动: ${filename}, downloadId: ${downloadId}`);
              
              // 保存完成状态
              await TaskManager.saveTaskState(taskId, {
                ...currentState,
                status: isStopExport ? 'stopped_with_export' : 'completed',
                endTime: Date.now(),
                data: data,
                downloadId: downloadId,
                filename: filename,
                isStopExport: isStopExport
              });
              
              console.log(`✅ 任务状态已更新为${isStopExport ? 'stopped_with_export' : 'completed'}: ${taskId}`);
              
              // 🔥 根据导出类型显示不同的完成通知
              const questionsCount = new Set(data.map(item => item.问题)).size;
              const sourcesCount = data.filter(item => item.网站url && item.网站url.trim()).length;
              
              let notificationConfig;
              if (isStopExport) {
                // 停止导出通知
                notificationConfig = {
                  type: 'basic',
                  iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23ff9800" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
                  title: 'Kimi自动问答已停止',
                  message: `🛑 用户手动停止任务\n📊 已导出 ${questionsCount} 个问答对\n🔗 包含 ${sourcesCount} 个网址\n💾 数据已保存到下载文件夹`
                };
              } else {
                // 完成导出通知
                notificationConfig = {
                  type: 'basic',
                  iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%2328a745" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
                  title: 'Kimi自动问答完成',
                  message: `🎉 批量问答已完成！\n📊 收集了 ${questionsCount} 个问答对\n🔗 包含 ${sourcesCount} 个网址\n💾 CSV文件已保存到下载文件夹`
                };
              }
              
              chrome.notifications.create(notificationConfig);
              
              console.log(`🔔 ${isStopExport ? '停止导出' : '自动收集完成'}通知已显示`);
              
              // 通知所有popup窗口任务完成（为了支持多窗口）
              notifyAllPopupsTaskComplete(taskId, true, data, null, isStopExport);
              
              // 🔥 根据导出类型设置不同的清理延迟时间
              const cleanupDelay = isStopExport ? 3 * 60 * 1000 : 5 * 60 * 1000; // 停止导出3分钟后清理，完成导出5分钟后清理
              setTimeout(() => {
                TaskManager.clearTask(taskId);
                processingTasks.delete(taskId);
                stoppingTasks.delete(taskId);
                console.log(`🧹 任务状态已清理: ${taskId}`);
              }, cleanupDelay);
              
            } catch (downloadError) {
              console.error('💥 下载文件失败:', downloadError);
              await TaskManager.saveTaskState(taskId, {
                ...currentState,
                status: 'failed',
                endTime: Date.now(),
                error: `下载失败: ${downloadError.message}`,
                isStopExport: isStopExport
              });
              
              // 🔥 根据导出类型显示不同的错误通知
              const errorTitle = isStopExport ? 'Kimi停止导出失败' : 'Kimi自动采集器';
              const errorMessage = isStopExport 
                ? `停止导出失败，请检查下载权限。错误: ${downloadError.message}`
                : `下载失败，请检查下载权限。错误: ${downloadError.message}`;
              
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23ff9800" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
                title: errorTitle,
                message: errorMessage
              });
              
              // 通知popup任务失败
              notifyAllPopupsTaskComplete(taskId, false, null, `下载失败: ${downloadError.message}`, isStopExport);
            }
          } else {
            // 任务失败
            console.log(`❌ 任务失败，更新状态: ${taskId}`);
            await TaskManager.saveTaskState(taskId, {
              ...currentState,
              status: 'failed',
              endTime: Date.now(),
              error: error,
              isStopExport: isStopExport
            });
            
            // 只在明显的错误情况下显示通知
            if (error && !error.includes('用户停止')) {
              const errorTitle = isStopExport ? 'Kimi停止导出失败' : 'Kimi自动采集器';
              const errorMessage = isStopExport 
                ? `停止导出失败: ${error || '未知错误'}`
                : `收集失败: ${error || '未知错误'}`;
              
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23ff0000" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>',
                title: errorTitle,
                message: errorMessage
              });
            }
            
            // 通知popup任务失败
            notifyAllPopupsTaskComplete(taskId, false, null, error, isStopExport);
            
            // 1分钟后清理失败的任务状态
            setTimeout(() => {
              TaskManager.clearTask(taskId);
              processingTasks.delete(taskId);
              stoppingTasks.delete(taskId);
              console.log(`🧹 失败任务状态已清理: ${taskId}`);
            }, 60 * 1000);
          }
        } else {
          console.warn(`⚠️ 未找到任务状态: ${taskId}`);
        }
      } finally {
        // 无论成功失败，都要移除处理标记
        processingTasks.delete(taskId);
      }
    }).catch(error => {
      console.error('💥 处理任务完成通知失败:', error);
      processingTasks.delete(taskId);
    });
    
    sendResponse({ success: true });
    return false;
  }
  
  // 获取任务状态
  else if (request.action === 'getTaskState') {
    const { taskId } = request;
    TaskManager.getTaskState(taskId).then(state => {
      sendResponse({ success: true, state: state });
    });
    return true;
  }
  
  // 获取活跃任务
  else if (request.action === 'getActiveTasks') {
    TaskManager.getActiveTasks().then(tasks => {
      sendResponse({ success: true, tasks: tasks });
    });
    return true;
  }
  
  // 清理任务
  else if (request.action === 'clearTask') {
    const { taskId } = request;
    TaskManager.clearTask(taskId).then(() => {
      processingTasks.delete(taskId);
      stoppingTasks.delete(taskId);
      sendResponse({ success: true });
    });
    return true;
  }

  // 停止任务
  else if (request.action === 'stopTask') {
    const { taskId, reason } = request;
    console.log(`🛑 收到停止任务请求: ${taskId}, 原因: ${reason}`);
    
    // 立即标记任务为停止中
    stoppingTasks.add(taskId);
    
    TaskManager.getTaskState(taskId).then(async currentState => {
      if (currentState) {
        console.log(`🛑 停止任务: ${taskId}`);
        
        try {
          // 更新任务状态为已停止
          await TaskManager.saveTaskState(taskId, {
            ...currentState,
            status: 'stopped',
            endTime: Date.now(),
            stopReason: reason
          });
          
          console.log(`✅ 任务状态已更新为stopped: ${taskId}`);
          
          console.log('🛑 任务停止完成，用户界面将显示停止状态');
          
          // 延迟清理任务状态
          setTimeout(() => {
            TaskManager.clearTask(taskId);
            processingTasks.delete(taskId);
            stoppingTasks.delete(taskId);
            console.log(`🧹 已清理停止的任务: ${taskId}`);
          }, 5000);
          
          sendResponse({ success: true });
        } catch (error) {
          console.error('💥 更新停止状态失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      } else {
        console.warn(`⚠️ 要停止的任务不存在: ${taskId}`);
        stoppingTasks.delete(taskId);
        sendResponse({ success: false, error: '任务不存在' });
      }
    }).catch(error => {
      console.error('💥 处理停止任务失败:', error);
      stoppingTasks.delete(taskId);
      sendResponse({ success: false, error: error.message });
    });
    
    return true;
  }

  // 强制清理所有任务
  else if (request.action === 'forceCleanupAllTasks') {
    console.log('🧹 执行强制清理所有任务...');
    
    processingTasks.clear();
    stoppingTasks.clear();
    
    chrome.storage.local.clear().then(() => {
      console.log('✅ 所有任务状态已清理');
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%2328a745" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
        title: 'Kimi自动采集器',
        message: '所有后台任务状态已强制清理'
      });
      
      sendResponse({ success: true });
    }).catch(error => {
      console.error('💥 强制清理失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true;
  }

  return false;
});

// 通知所有popup窗口任务完成的函数
function notifyAllPopupsTaskComplete(taskId, success, data, error, isStopExport = false) {
  try {
    // 获取所有插件窗口
    chrome.runtime.getViews({ type: 'popup' }).forEach(view => {
      try {
        // 向popup窗口发送消息
        if (view && view.chrome && view.chrome.runtime) {
          view.chrome.runtime.sendMessage({
            action: 'taskComplete',
            taskId: taskId,
            success: success,
            data: data,
            error: error,
            isStopExport: isStopExport // 🔥 传递停止导出标志
          });
        }
      } catch (error) {
        console.log('通知popup窗口失败:', error);
      }
    });
  } catch (error) {
    console.error('获取popup窗口失败:', error);
  }
}

// 定期清理过期的任务状态
setInterval(async () => {
  try {
    const result = await chrome.storage.local.get(null);
    const now = Date.now();
    const expiredTasks = [];
    
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('task_')) {
        // 清理超过24小时的任务
        if (now - value.lastUpdated > 24 * 60 * 60 * 1000) {
          expiredTasks.push(key);
          
          const taskId = key.replace('task_', '');
          processingTasks.delete(taskId);
          stoppingTasks.delete(taskId);
        }
      }
      // 清理超过24小时的popup状态
      else if (key === 'popup_state') {
        if (value.savedAt && now - value.savedAt > 24 * 60 * 60 * 1000) {
          expiredTasks.push(key);
        }
      }
    }
    
    if (expiredTasks.length > 0) {
      await chrome.storage.local.remove(expiredTasks);
      console.log(`清理了 ${expiredTasks.length} 个过期项目`);
    }
  } catch (error) {
    console.error('清理过期项目失败:', error);
  }
}, 60 * 60 * 1000); // 每小时检查一次

// 监听标签页关闭，清理相关任务
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    // 查找与该标签页相关的任务
    const result = await chrome.storage.local.get(null);
    const tasksToCleanup = [];
    
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('task_') && value.tabId === tabId) {
        tasksToCleanup.push(key);
        
        // 清理相关标记
        const taskId = key.replace('task_', '');
        processingTasks.delete(taskId);
        stoppingTasks.delete(taskId);
      }
    }
    
    if (tasksToCleanup.length > 0) {
      await chrome.storage.local.remove(tasksToCleanup);
      console.log(`清理了与标签页 ${tabId} 相关的 ${tasksToCleanup.length} 个任务`);
    }
  } catch (error) {
    console.error('清理标签页相关任务失败:', error);
  }
});

// 暴露到全局
globalThis.TaskManager = TaskManager;
globalThis.DownloadManager = DownloadManager;