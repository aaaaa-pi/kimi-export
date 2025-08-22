// 后台服务脚本 - 自动模式专用版（修复Manifest V3兼容性问题）
chrome.runtime.onInstalled.addListener(() => {
  console.log('Kimi自动采集器已安装');
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

// 修复的下载管理器 - Service Worker兼容版本
const DownloadManager = {
  generateQAWithSourcesCSV(data) {
    let csv = '问题,AI输出的答案,文件名,序号,标题,内容,网站,网站url,文章引用时间\n';
    
    if (data && data.length > 0) {
      data.forEach((row) => {
        csv += `"${this.escapeCsvValue(row.问题)}","${this.escapeCsvValue(row.AI输出的答案)}","${this.escapeCsvValue(row.文件名)}","${this.escapeCsvValue(row.序号)}","${this.escapeCsvValue(row.标题)}","${this.escapeCsvValue(row.内容)}","${this.escapeCsvValue(row.网站)}","${this.escapeCsvValue(row.网站url)}","${this.escapeCsvValue(row.文章引用时间)}"\n`;
      });
    }
    
    return csv;
  },

  // 改进的CSV转义函数，更安全地处理特殊字符
  escapeCsvValue(value) {
    if (!value) return '';
    
    let str = value.toString();
    
    // 更安全的字符处理
    str = str
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 移除控制字符
      .replace(/"/g, '""') // CSV标准的引号转义
      .replace(/[\r\n]+/g, ' ') // 将换行符替换为空格
      .trim(); // 移除首尾空白
    
    return str;
  },

  // 现代化的UTF-8安全下载方法
  async downloadCSV(csvContent, filename) {
    try {
      console.log(`📄 准备下载文件: ${filename}`);
      
      const csvWithBOM = '\uFEFF' + csvContent;
      
      // 使用 TextEncoder 进行正确的UTF-8编码
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(csvWithBOM);
      
      // 将 Uint8Array 转换为 base64
      const base64Content = this.uint8ArrayToBase64(uint8Array);
      const dataUrl = `data:text/csv;charset=utf-8;base64,${base64Content}`;
      
      console.log('📊 CSV内容统计:', {
        原始长度: csvContent.length,
        带BOM长度: csvWithBOM.length,
        编码后字节数: uint8Array.length,
        Base64长度: base64Content.length,
        文件名: filename
      });
      
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
  },

  // 现代化的 Uint8Array 到 Base64 转换
  uint8ArrayToBase64(uint8Array) {
    try {
      let binaryString = '';
      const chunkSize = 0x8000; // 32KB chunks to avoid call stack overflow
      
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, chunk);
      }
      
      return btoa(binaryString);
    } catch (error) {
      console.error('Base64编码失败:', error);
      throw new Error(`Base64编码失败: ${error.message}`);
    }
  },

  // Blob URL备用方法
  async downloadCSVBlob(csvContent, filename) {
    try {
      console.log(`📄 尝试Blob下载方法: ${filename}`);
      
      const csvWithBOM = '\uFEFF' + csvContent;
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      
      const downloadId = await chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      });
      
      // 清理 Object URL
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      
      console.log(`✅ Blob下载成功: ${filename}, downloadId: ${downloadId}`);
      return downloadId;
      
    } catch (error) {
      console.error('💥 Blob下载失败:', error);
      throw new Error(`Blob下载失败: ${error.message}`);
    }
  },

  // 传统URL编码备用方法
  async downloadCSVFallback(csvContent, filename) {
    try {
      console.log(`📄 尝试备用下载方法: ${filename}`);
      
      const csvWithBOM = '\uFEFF' + csvContent;
      
      // 分段编码避免长字符串问题
      const chunks = [];
      const chunkSize = 1000;
      
      for (let i = 0; i < csvWithBOM.length; i += chunkSize) {
        const chunk = csvWithBOM.substring(i, i + chunkSize);
        chunks.push(encodeURIComponent(chunk));
      }
      
      const encodedContent = chunks.join('');
      const dataUrl = `data:text/plain;charset=utf-8,${encodedContent}`;
      
      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: filename.replace('.csv', '.txt'),
        saveAs: true,
        conflictAction: 'uniquify'
      });
      
      console.log(`✅ 备用下载成功: ${filename}, downloadId: ${downloadId}`);
      return downloadId;
      
    } catch (error) {
      console.error('💥 备用下载也失败:', error);
      throw new Error(`所有下载方法都失败: ${error.message}`);
    }
  }
};

// 修复的通知创建函数
function createNotification(config) {
  try {
    // 使用简单的1x1透明像素图标
    const simpleIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const notificationConfig = {
      type: 'basic',
      iconUrl: simpleIcon,
      title: config.title || 'Kimi自动问答器',
      message: (config.message || '').substring(0, 300), // 限制长度
      priority: 1,
      requireInteraction: false
    };

    console.log('📢 创建通知:', notificationConfig.title);

    chrome.notifications.create(notificationConfig)
      .then((notificationId) => {
        console.log('✅ 通知创建成功, ID:', notificationId);
      })
      .catch((error) => {
        console.warn('⚠️ 通知创建失败:', error);
        
        // 最简化备用通知
        chrome.notifications.create({
          type: 'basic',
          title: config.title || 'Kimi自动问答器',
          message: (config.message || '').substring(0, 100)
        }).catch(() => {
          console.error('❌ 连备用通知也失败');
        });
      });

  } catch (error) {
    console.error('💥 创建通知异常:', error);
  }
}

// 修复的通知函数 - Manifest V3兼容版本
function notifyAllPopupsTaskComplete(taskId, success, data, error, isStopExport = false) {
  const message = {
    action: 'taskComplete',
    taskId: taskId,
    success: success,
    data: data,
    error: error,
    isStopExport: isStopExport,
    timestamp: Date.now()
  };
  
  // 尝试向popup广播消息
  try {
    chrome.runtime.sendMessage(message).catch((err) => {
      console.log('没有popup在监听消息，这是正常的');
    });
  } catch (error) {
    console.log('广播消息到popup失败:', error);
  }
}

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('kimi.com')) {
    console.log('Kimi页面加载完成');
  }
});

// 防止重复处理的任务集合
let processingTasks = new Set();
let stoppingTasks = new Set();

// 监听来自content script和popup的消息
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log('Background收到消息:', request);

  if (request.action === 'contentScriptReady') {
    console.log('Content script准备就绪');
    sendResponse({ success: true });
  }
  
  // 任务开始
  else if (request.action === 'taskStart') {
    const { taskId, type, tabId } = request;
    
    stoppingTasks.delete(taskId);
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
    
    console.log(`📋 任务完成详情:`, {
      taskId: taskId,
      success: success,
      dataCount: data ? data.length : 0,
      isStopExport: isStopExport,
      error: error,
      timestamp: new Date().toISOString()
    });
    
    // 手动导出失败的特殊处理
    if (taskId === 'manual_export' && !success) {
      console.error('❌ 手动导出失败详情:', {
        error: error,
        timestamp: new Date().toISOString(),
        sender: sender
      });
      
      createNotification({
        title: 'Kimi手动导出失败',
        message: `导出失败：${error}\n\n建议解决方案：\n1. 刷新Kimi页面\n2. 重新加载扩展\n3. 检查网络连接`
      });
      
      notifyAllPopupsTaskComplete(taskId, false, null, error, false);
      sendResponse({ success: true });
      return false;
    }
    
    const isManualExport = taskId === 'manual_export';
    
    if (isManualExport) {
      console.log('手动导出请求，直接处理下载...');
      
      if (success && data) {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const filename = `Kimi手动导出数据_${timestamp}.csv`;
          
          const csvContent = DownloadManager.generateQAWithSourcesCSV(data);
          console.log(`生成手动导出CSV文件: ${filename}`);
          
         // 改进的下载逻辑 - 多层备用方案
          let downloadId;
          let downloadSuccess = false;

          // 方法1: 现代Base64编码
          try {
            console.log('🔄 尝试方法1: 现代Base64编码...');
            downloadId = await DownloadManager.downloadCSV(csvContent, filename);
            downloadSuccess = true;
            console.log(`✅ 方法1成功: ${filename}`);
          } catch (method1Error) {
            console.warn('⚠️ 方法1失败:', method1Error.message);
            
            // 方法2: Blob URL
            try {
              console.log('🔄 尝试方法2: Blob URL...');
              downloadId = await DownloadManager.downloadCSVBlob(csvContent, filename);
              downloadSuccess = true;
              console.log(`✅ 方法2成功: ${filename}`);
            } catch (method2Error) {
              console.warn('⚠️ 方法2失败:', method2Error.message);
              
              // 方法3: 传统URL编码
              try {
                console.log('🔄 尝试方法3: 传统编码...');
                downloadId = await DownloadManager.downloadCSVFallback(csvContent, filename);
                downloadSuccess = true;
                console.log(`✅ 方法3成功: ${filename}`);
              } catch (method3Error) {
                console.error('❌ 所有下载方法都失败');
                throw new Error(`所有下载方法失败: 
          方法1: ${method1Error.message}
          方法2: ${method2Error.message}  
          方法3: ${method3Error.message}`);
              }
            }
          }
          
          const questionsCount = new Set(data.map(item => item.问题)).size;
          const sourcesCount = data.filter(item => item.网站url && item.网站url.trim()).length;
          
          createNotification({
            title: 'Kimi手动导出完成',
            message: `手动导出完成！\n导出了 ${questionsCount} 个问答对\n包含 ${sourcesCount} 个网址\n💾 CSV文件已保存到下载文件夹`
          });
          
          notifyAllPopupsTaskComplete(taskId, true, data, null, false);
          
        } catch (downloadError) {
          console.error('手动导出下载失败:', downloadError);
          
          createNotification({
            title: 'Kimi手动导出失败',
            message: `手动导出失败，请检查下载权限。错误: ${downloadError.message}`
          });
          
          notifyAllPopupsTaskComplete(taskId, false, null, `下载失败: ${downloadError.message}`, false);
        }
      } else {
        console.log('手动导出失败，无有效数据');
        const errorMsg = error || '无有效数据';
        
        createNotification({
          title: 'Kimi手动导出失败',
          message: `手动导出失败: ${errorMsg}`
        });
        
        notifyAllPopupsTaskComplete(taskId, false, null, errorMsg, false);
      }
      
      sendResponse({ success: true });
      return false;
    }
    
    // 检查任务是否正在停止
    if (stoppingTasks.has(taskId)) {
      console.log(`任务 ${taskId} 正在停止，忽略完成通知`);
      sendResponse({ success: false, message: '任务正在停止' });
      return false;
    }
    
    // 防重复处理检查
    if (processingTasks.has(taskId)) {
      console.log(`任务 ${taskId} 已在处理中，忽略重复请求`);
      sendResponse({ success: false, error: '任务正在处理中' });
      return false;
    }
    
    processingTasks.add(taskId);
    
    if (isStopExport) {
      console.log(`收到停止导出通知: taskId=${taskId}, success=${success}`);
    } else {
      console.log(`任务完成通知: taskId=${taskId}, success=${success}`);
    }
    
    TaskManager.getTaskState(taskId).then(async currentState => {
      try {
        if (currentState) {
          console.log(`找到任务状态:`, currentState);
          
          if (success && data) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            
            let filename;
            if (isStopExport) {
              filename = `Kimi停止导出数据_${timestamp}.csv`;
            } else {
              filename = `Kimi自动问答数据_${timestamp}.csv`;
            }
            
            const csvContent = DownloadManager.generateQAWithSourcesCSV(data);
            console.log(`生成CSV文件: ${filename}`);
            
            try {
              // 🔥 使用修复后的下载方法
              let downloadId;
              try {
                downloadId = await DownloadManager.downloadCSV(csvContent, filename);
                console.log(`文件下载启动: ${filename}, downloadId: ${downloadId}`);
              } catch (downloadError) {
                console.warn('主要下载方法失败，尝试备用方法:', downloadError);
                downloadId = await DownloadManager.downloadCSVFallback(csvContent, filename);
                console.log(`备用下载方法成功: ${filename}, downloadId: ${downloadId}`);
              }
              
              await TaskManager.saveTaskState(taskId, {
                ...currentState,
                status: isStopExport ? 'stopped_with_export' : 'completed',
                endTime: Date.now(),
                data: data,
                downloadId: downloadId,
                filename: filename,
                isStopExport: isStopExport
              });
              
              const questionsCount = new Set(data.map(item => item.问题)).size;
              const sourcesCount = data.filter(item => item.网站url && item.网站url.trim()).length;
              
              let notificationConfig;
              if (isStopExport) {
                notificationConfig = {
                  title: 'Kimi自动问答已停止',
                  message: `用户手动停止任务\n已导出 ${questionsCount} 个问答对\n包含 ${sourcesCount} 个网址\n数据已保存到下载文件夹`
                };
              } else {
                notificationConfig = {
                  title: 'Kimi自动问答完成',
                  message: `批量问答已完成！\n收集了 ${questionsCount} 个问答对\n包含 ${sourcesCount} 个网址\nCSV文件已保存到下载文件夹`
                };
              }
              
              createNotification(notificationConfig);
              notifyAllPopupsTaskComplete(taskId, true, data, null, isStopExport);
              
              const cleanupDelay = isStopExport ? 3 * 60 * 1000 : 5 * 60 * 1000;
              setTimeout(() => {
                TaskManager.clearTask(taskId);
                processingTasks.delete(taskId);
                stoppingTasks.delete(taskId);
                console.log(`任务状态已清理: ${taskId}`);
              }, cleanupDelay);
              
            } catch (downloadError) {
              console.error('下载文件失败:', downloadError);
              
              await TaskManager.saveTaskState(taskId, {
                ...currentState,
                status: 'failed',
                endTime: Date.now(),
                error: `下载失败: ${downloadError.message}`,
                isStopExport: isStopExport
              });
              
              const errorTitle = isStopExport ? 'Kimi停止导出失败' : 'Kimi自动采集器';
              const errorMessage = isStopExport 
                ? `停止导出失败，请检查下载权限。错误: ${downloadError.message}`
                : `下载失败，请检查下载权限。错误: ${downloadError.message}`;
              
              createNotification({
                title: errorTitle,
                message: errorMessage
              });
              
              notifyAllPopupsTaskComplete(taskId, false, null, `下载失败: ${downloadError.message}`, isStopExport);
            }
          } else {
            console.log(`任务失败，更新状态: ${taskId}`);
            await TaskManager.saveTaskState(taskId, {
              ...currentState,
              status: 'failed',
              endTime: Date.now(),
              error: error,
              isStopExport: isStopExport
            });
            
            if (error && !error.includes('用户停止')) {
              const errorTitle = isStopExport ? 'Kimi停止导出失败' : 'Kimi自动采集器';
              const errorMessage = isStopExport 
                ? `停止导出失败: ${error || '未知错误'}`
                : `收集失败: ${error || '未知错误'}`;
              
              createNotification({
                title: errorTitle,
                message: errorMessage
              });
            }
            
            notifyAllPopupsTaskComplete(taskId, false, null, error, isStopExport);
            
            setTimeout(() => {
              TaskManager.clearTask(taskId);
              processingTasks.delete(taskId);
              stoppingTasks.delete(taskId);
              console.log(`失败任务状态已清理: ${taskId}`);
            }, 60 * 1000);
          }
        } else {
          console.warn(`未找到任务状态: ${taskId}`);
        }
      } finally {
        processingTasks.delete(taskId);
      }
    }).catch(error => {
      console.error('处理任务完成通知失败:', error);
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
    
    stoppingTasks.add(taskId);
    
    TaskManager.getTaskState(taskId).then(async currentState => {
      if (currentState) {
        console.log(`🛑 停止任务: ${taskId}`);
        
        try {
          await TaskManager.saveTaskState(taskId, {
            ...currentState,
            status: 'stopped',
            endTime: Date.now(),
            stopReason: reason
          });
          
          console.log(`✅ 任务状态已更新为stopped: ${taskId}`);
          
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
      
      createNotification({
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

// 定期清理过期的任务状态
setInterval(async () => {
  try {
    const result = await chrome.storage.local.get(null);
    const now = Date.now();
    const expiredTasks = [];
    
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('task_')) {
        if (now - value.lastUpdated > 24 * 60 * 60 * 1000) {
          expiredTasks.push(key);
          
          const taskId = key.replace('task_', '');
          processingTasks.delete(taskId);
          stoppingTasks.delete(taskId);
        }
      }
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
}, 60 * 60 * 1000);

// 监听标签页关闭，清理相关任务
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    const result = await chrome.storage.local.get(null);
    const tasksToCleanup = [];
    
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('task_') && value.tabId === tabId) {
        tasksToCleanup.push(key);
        
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