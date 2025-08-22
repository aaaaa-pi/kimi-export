// 弹窗界面逻辑 - 自动模式专用版（支持状态持久化 + 安全数据管理）
document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup DOM 已加载 - 自动模式专用版（支持状态持久化 + 安全数据管理）');
  
  // DOM元素获取
  const elements = {
    excelUpload: document.getElementById('excelUpload'),
    excelFile: document.getElementById('excelFile'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    questionCount: document.getElementById('questionCount'),
    
    startAutoCollectionBtn: document.getElementById('startAutoCollection'),
    finishAndExportBtn: document.getElementById('finishAndExport'),
    stopCollectionBtn: document.getElementById('stopCollection'),
    clearDataBtn: document.getElementById('clearData'), 
    
    statusDiv: document.getElementById('status'),
    modeIndicator: document.getElementById('modeIndicator')
  };

  // 检查关键元素是否存在
  console.log('🔍 检查DOM元素是否存在:');
  const requiredElements = [
    'startAutoCollectionBtn', 'finishAndExportBtn', 'stopCollectionBtn', 'statusDiv', 'excelFile'
  ];
  
  const missingElements = [];
  for (const elementName of requiredElements) {
    if (!elements[elementName]) {
      missingElements.push(elementName);
      console.error(`❌ ${elementName}: 未找到`);
    } else {
      console.log(`✅ ${elementName}: 已找到`);
    }
  }
  
  if (missingElements.length > 0) {
    console.error('未找到必要的DOM元素:', missingElements);
    alert(`插件界面加载失败，未找到以下元素：${missingElements.join(', ')}\n\n请检查popup.html文件或重新安装插件`);
    return;
  }
  
  console.log('✅ 所有必要DOM元素已找到');

  // 增强的全局状态管理（支持持久化）
  const AppState = {
    currentTaskId: null,
    isCollecting: false,
    startTime: null,
    questions: [],
    isStopping: false,
    hasCollectedData: false,
    lastProgressUpdate: null,
    // 🔥 新增：导出状态管理
    exportStatus: {
      autoExportAttempted: false,
      autoExportSuccess: false,
      lastExportError: null,
      dataAwaitingExport: false
    },
    
    generateTaskId() {
      return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    // 保存状态到chrome.storage
    async saveState() {
      try {
        const stateToSave = {
          currentTaskId: this.currentTaskId,
          isCollecting: this.isCollecting,
          startTime: this.startTime,
          questions: this.questions,
          isStopping: this.isStopping,
          hasCollectedData: this.hasCollectedData,
          lastProgressUpdate: this.lastProgressUpdate,
          exportStatus: this.exportStatus, // 🔥 保存导出状态
          savedAt: Date.now()
        };
        
        await chrome.storage.local.set({ 'popup_state': stateToSave });
        console.log('💾 状态已保存到storage:', stateToSave);
      } catch (error) {
        console.error('💥 保存状态失败:', error);
      }
    },
    
    // 从chrome.storage恢复状态
    async loadState() {
      try {
        const result = await chrome.storage.local.get(['popup_state']);
        const savedState = result.popup_state;
        
        if (savedState) {
          console.log('💾 从storage恢复状态:', savedState);
          
          // 检查整体状态是否过期（超过24小时）
          const isExpired = Date.now() - savedState.savedAt > 24 * 60 * 60 * 1000;
          if (isExpired) {
            console.log('⏰ 保存的状态已过期，清理...');
            await this.clearStoredState();
            return false;
          }
          
          // 🔥 新增：检查停止状态是否过期（超过30秒认为停止流程已完成）
          if (savedState.isStopping) {
            const stopStateAge = Date.now() - savedState.savedAt;
            const STOP_STATE_TIMEOUT = 30 * 1000; // 30秒超时
            
            if (stopStateAge > STOP_STATE_TIMEOUT) {
              console.log(`⏰ 停止状态已过期 (${Math.floor(stopStateAge/1000)}秒)，强制重置为完成状态`);
              
              // 强制重置停止状态，但保留其他数据
              savedState.isStopping = false;
              savedState.isCollecting = false;
              
              // 立即保存修正后的状态
              await chrome.storage.local.set({ 'popup_state': savedState });
            }
          }
          
          // 恢复状态
          this.currentTaskId = savedState.currentTaskId;
          this.isCollecting = savedState.isCollecting || false;
          this.startTime = savedState.startTime;
          this.questions = savedState.questions || [];
          this.isStopping = savedState.isStopping || false;
          this.hasCollectedData = savedState.hasCollectedData || false;
          this.lastProgressUpdate = savedState.lastProgressUpdate;
          // 🔥 恢复导出状态
          this.exportStatus = savedState.exportStatus || {
            autoExportAttempted: false,
            autoExportSuccess: false,
            lastExportError: null,
            dataAwaitingExport: false
          };
          
          console.log('✅ 状态恢复完成');
          return true;
        } else {
          console.log('💾 未找到保存的状态');
          return false;
        }
      } catch (error) {
        console.error('💥 加载状态失败:', error);
        return false;
      }
    },
    
    // 清理存储的状态
    async clearStoredState() {
      try {
        await chrome.storage.local.remove(['popup_state']);
        console.log('🧹 已清理存储的状态');
      } catch (error) {
        console.error('💥 清理存储状态失败:', error);
      }
    },
    
    // 重置状态（保留数据）
    async reset() {
      this.currentTaskId = null;
      this.isCollecting = false;
      this.startTime = null;
      this.isStopping = false;
      this.lastProgressUpdate = null;
      // 注意：hasCollectedData不重置，保留已收集的数据状态
      // 注意：questions不重置，保留已上传的问题
      // 🔥 重置导出状态（但保留数据等待导出标志）
      this.exportStatus.autoExportAttempted = false;
      this.exportStatus.autoExportSuccess = false;
      this.exportStatus.lastExportError = null;
      // dataAwaitingExport 根据实际情况决定是否保留
      
      await this.saveState();
    },
    
    // 完全重置状态（清空所有数据）
    async fullReset() {
      this.currentTaskId = null;
      this.isCollecting = false;
      this.startTime = null;
      this.questions = [];
      this.isStopping = false;
      this.hasCollectedData = false;
      this.lastProgressUpdate = null;
      // 🔥 完全重置导出状态
      this.exportStatus = {
        autoExportAttempted: false,
        autoExportSuccess: false,
        lastExportError: null,
        dataAwaitingExport: false
      };
      
      await this.saveState();
      console.log('🧹 已完全重置所有状态和数据');
    },
    
    // 更新状态（自动保存）
    async updateState(updates) {
      Object.assign(this, updates);
      await this.saveState();
    },

    // 🔥 新增：更新导出状态
    async updateExportStatus(updates) {
      Object.assign(this.exportStatus, updates);
      await this.saveState();
    }
  };

  // 清空文件选择和相关显示
  function clearFileInput() {
    try {
      console.log('🧹 清空文件输入...');
      
      // 清空文件输入
      if (elements.excelFile) {
        elements.excelFile.value = '';
      }
      
      // 隐藏文件信息
      if (elements.fileInfo) {
        elements.fileInfo.classList.remove('show');
      }
      
      // 清空文件信息显示
      if (elements.fileName) {
        elements.fileName.textContent = '';
      }
      if (elements.questionCount) {
        elements.questionCount.textContent = '';
      }
      
      console.log('✅ 文件输入已清空');
    } catch (error) {
      console.error('💥 清空文件输入失败:', error);
    }
  }

  // 显示状态消息
  function showStatus(message, type = 'info', duration = 5000) {
    console.log(`显示状态: ${type} - ${message}`);
    try {
      elements.statusDiv.textContent = message;
      elements.statusDiv.className = `status ${type}`;
      elements.statusDiv.style.display = 'block';
      
      if (duration > 0 && !AppState.isCollecting) {
        setTimeout(() => {
          if (elements.statusDiv.textContent === message && !AppState.isCollecting) {
            elements.statusDiv.style.display = 'none';
          }
        }, duration);
      }
    } catch (error) {
      console.error('显示状态失败:', error);
    }
  }

  let updateButtonStatesTimeout = null;
  // 更新按钮状态
  function updateButtonStates() {
    // 防抖：避免频繁更新
    if (updateButtonStatesTimeout) {
      clearTimeout(updateButtonStatesTimeout);
    }
    
    updateButtonStatesTimeout = setTimeout(() => {
      doUpdateButtonStates();
    }, 100);
  }
  
  function doUpdateButtonStates() {
    try {
      console.log('🔄 更新按钮状态，当前状态:', {
        isCollecting: AppState.isCollecting,
        isStopping: AppState.isStopping,
        questionsLength: AppState.questions.length,
        hasCollectedData: AppState.hasCollectedData,
        dataAwaitingExport: AppState.exportStatus.dataAwaitingExport,
        currentTaskId: AppState.currentTaskId
      });
  
      // 🔥 修复：强制检查DOM元素是否存在
      if (!elements.startAutoCollectionBtn || !elements.stopCollectionBtn || !elements.finishAndExportBtn) {
        console.error('❌ 关键DOM元素缺失，跳过按钮状态更新');
        return;
      }
  
      if (AppState.isCollecting && !AppState.isStopping) {
        // 收集进行中
        console.log('📊 状态：自动问答进行中');
        elements.startAutoCollectionBtn.style.display = 'none';
        elements.finishAndExportBtn.style.display = 'none';
        elements.stopCollectionBtn.style.display = 'block';
        elements.stopCollectionBtn.disabled = false;
        elements.stopCollectionBtn.textContent = '🛑 停止自动问答';
        
        // 隐藏清空按钮
        if (elements.clearDataBtn) {
          elements.clearDataBtn.style.display = 'none';
        }
        
        if (elements.modeIndicator) {
          elements.modeIndicator.classList.add('show');
          elements.modeIndicator.textContent = '🤖 自动问答模式进行中';
          elements.modeIndicator.style.background = ''; // 重置背景色
        }
        
        console.log('✅ 已设置为进行中状态，停止按钮应该可见');
        
      } else if (AppState.isStopping) {
        // 正在停止状态
        console.log('🛑 状态：正在停止');
        elements.stopCollectionBtn.disabled = true;
        elements.stopCollectionBtn.textContent = '🔄 停止中...';
        elements.stopCollectionBtn.style.display = 'block'; // 确保按钮可见
        
        // 隐藏清空按钮
        if (elements.clearDataBtn) {
          elements.clearDataBtn.style.display = 'none';
        }
        
        if (elements.modeIndicator) {
          elements.modeIndicator.classList.add('show');
          elements.modeIndicator.textContent = '🛑 正在停止自动问答...';
          elements.modeIndicator.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
        }
        
      } else {
        // 默认状态
        console.log('📋 状态：默认状态');
        elements.stopCollectionBtn.style.display = 'none';
        
        if (elements.modeIndicator) {
          elements.modeIndicator.classList.remove('show');
          elements.modeIndicator.style.background = '';
        }
        
        elements.startAutoCollectionBtn.style.display = 'block';
        elements.startAutoCollectionBtn.disabled = AppState.questions.length === 0;
        elements.startAutoCollectionBtn.textContent = AppState.questions.length > 0 
          ? `🤖 开始自动问答 (${AppState.questions.length}个问题)` 
          : '🤖 请先上传问题文件';
          
        // 手动导出按钮逻辑
        if (AppState.hasCollectedData || AppState.exportStatus.dataAwaitingExport) {
          elements.finishAndExportBtn.style.display = 'block';
          elements.finishAndExportBtn.disabled = false;
          
          if (AppState.exportStatus.dataAwaitingExport) {
            elements.finishAndExportBtn.textContent = '📋 导出待保存数据';
            elements.finishAndExportBtn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
          } else {
            elements.finishAndExportBtn.textContent = '📋 手动导出数据';
            elements.finishAndExportBtn.style.background = 'linear-gradient(135deg, #fd7e14 0%, #e8590c 100%)';
          }
        } else {
          elements.finishAndExportBtn.style.display = 'none';
        }
        
        // 控制清空按钮显示
        if (elements.clearDataBtn) {
          if (AppState.questions.length > 0 || AppState.hasCollectedData || AppState.exportStatus.dataAwaitingExport) {
            elements.clearDataBtn.style.display = 'block';
            elements.clearDataBtn.disabled = false;
            
            if (AppState.exportStatus.dataAwaitingExport) {
              elements.clearDataBtn.textContent = '⚠️ 清空数据(含待导出)';
              elements.clearDataBtn.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
            } else {
              elements.clearDataBtn.textContent = '🧹 清空所有数据';
              elements.clearDataBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #5a6268 100%)';
            }
          } else {
            elements.clearDataBtn.style.display = 'none';
          }
        }
      }
      
      console.log('✅ 按钮状态更新完成');
      
    } catch (error) {
      console.error('💥 更新按钮状态失败:', error);
    }
  }

  // 更新文件信息显示
  function updateFileInfoDisplay() {
    if (AppState.questions.length > 0) {
      if (elements.fileName) {
        // 如果有文件名信息就显示，否则显示默认信息
        const currentFileName = elements.fileName.textContent;
        if (!currentFileName || currentFileName === '') {
          elements.fileName.textContent = '文件名: 已上传的问题文件';
        }
      }
      if (elements.questionCount) {
        elements.questionCount.textContent = `问题数量: ${AppState.questions.length} 个`;
      }
      if (elements.fileInfo) {
        elements.fileInfo.classList.add('show');
      }
    }
  }

  // 从background获取任务状态
  async function syncWithBackground() {
    try {
      console.log('🔄 与background同步状态...');
      
      // 获取活跃任务
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getActiveTasks' }, resolve);
      });
      
      if (response && response.success && response.tasks) {
        const activeTasks = response.tasks;
        console.log('📋 background中的活跃任务:', activeTasks);
        
        // 🔥 新增：如果本地状态显示正在停止中，但background中没有对应任务，说明停止已完成
        if (AppState.isStopping && AppState.currentTaskId) {
          const backgroundTask = activeTasks[AppState.currentTaskId];
          
          if (!backgroundTask || backgroundTask.status === 'stopped' || backgroundTask.status === 'completed') {
            console.log('🧹 背景任务已完成，清理本地停止状态');
            
            await AppState.updateState({
              isStopping: false,
              isCollecting: false
            });
            
            return true;
          }
        }
        
        // 查找当前任务
        if (AppState.currentTaskId && activeTasks[AppState.currentTaskId]) {
          const taskState = activeTasks[AppState.currentTaskId];
          console.log('🎯 找到当前任务状态:', taskState);
          
          // 更新本地状态
          await AppState.updateState({
            isCollecting: taskState.status === 'running',
            isStopping: taskState.status === 'stopped'
          });
          
          return true;
        } else if (Object.keys(activeTasks).length > 0) {
          // 有其他活跃任务，可能是popup关闭期间创建的
          const latestTaskId = Object.keys(activeTasks)[0];
          const latestTask = activeTasks[latestTaskId];
          
          console.log('🔄 发现新的活跃任务，同步状态:', latestTask);
          
          await AppState.updateState({
            currentTaskId: latestTaskId,
            isCollecting: latestTask.status === 'running',
            isStopping: latestTask.status === 'stopped'
          });
          
          return true;
        }
      }
      
      // 🔥 关键修复：只有在确认background确实没有任务，且本地状态已经持续一段时间时才清理
      if (AppState.isCollecting || AppState.isStopping) {
        // 检查状态持续时间
        const stateAge = Date.now() - (AppState.startTime || 0);
        const STATE_SYNC_DELAY = 5000; // 5秒延迟，给background足够时间创建任务
        
        if (stateAge > STATE_SYNC_DELAY) {
          console.log('🧹 确认background无活跃任务且状态已持续足够时间，清理本地状态');
          
          await AppState.updateState({
            isCollecting: false,
            isStopping: false
          });
          
          return true;
        } else {
          console.log(`⏳ 状态持续时间不足(${Math.floor(stateAge/1000)}s < ${STATE_SYNC_DELAY/1000}s)，暂不清理`);
          return false;
        }
      }
      
      return false;
    } catch (error) {
      console.error('💥 与background同步失败:', error);
      return false;
    }
  }

  // 恢复运行中状态的显示
  function restoreRunningStateDisplay() {
    if (AppState.isCollecting && !AppState.isStopping) {
      console.log('🔄 恢复运行中状态显示...');
      
      // 显示进行中的状态消息
      let statusMessage = '🤖 自动问答进行中...\n⚠️ 任务已在后台运行';
      
      if (AppState.lastProgressUpdate) {
        const progress = AppState.lastProgressUpdate;
        statusMessage = `🤖 自动问答进行中...\n📊 进度: ${progress.current}/${progress.total}\n💬 ${progress.message}\n⚠️ 请勿关闭KIMI页面`;
      } else if (AppState.questions.length > 0) {
        statusMessage = `🤖 自动问答进行中...\n📊 将处理 ${AppState.questions.length} 个问题\n⏳ 任务已在后台运行\n⚠️ 请保持页面活跃`;
      }
      
      showStatus(statusMessage, 'auto', 0);
      
    } else if (AppState.isStopping) {
      console.log('🛑 恢复停止中状态显示...');
      showStatus('🛑 正在停止自动问答任务...\n📡 正在安全停止所有组件\n⏳ 请稍候...', 'info', 0);
    }
  }

  // 检查页面是否为Kimi聊天页面
  async function checkKimiPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('当前页面URL:', tab.url);
      return tab.url && tab.url.includes('kimi.com'); // 🔥 修改：替换域名检查
    } catch (error) {
      console.error('检查页面失败:', error);
      return false;
    }
  }

  // 测试content script连接
  async function testConnection(retryCount = 3) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      for (let i = 0; i < retryCount; i++) {
        try {
          console.log(`尝试连接 content script (${i + 1}/${retryCount})`);
          
          const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('连接超时'));
            }, 3000);
            
            chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
          
          if (response && response.success) {
            console.log('连接成功:', response);
            return tab.id;
          } else {
            console.log('连接失败，响应:', response);
            throw new Error('无效响应');
          }
        } catch (error) {
          console.error(`连接尝试 ${i + 1} 失败:`, error);
          if (i < retryCount - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('测试连接失败:', error);
      return null;
    }
  }

  // 启动自动收集
  async function startAutoCollection() {
    try {
      console.log('🚀 开始启动自动收集...');
      
      if (AppState.isCollecting || AppState.isStopping) {
        showStatus('⚠️ 任务正在运行或停止中', 'warning');
        return;
      }
  
      // 检查是否有问题列表
      if (AppState.questions.length === 0) {
        showStatus('❌ 请先上传包含问题的Excel文件', 'error');
        return;
      }
  
      // 检查页面
      if (!(await checkKimiPage())) {
        showStatus('❌ 请在Kimi聊天页面使用此插件\n👉 请访问: https://www.kimi.com/', 'error');
        return;
      }
  
      // 检查连接
      showStatus('正在连接到页面，请稍候...', 'info');
      const tabId = await testConnection();
      if (!tabId) {
        showStatus('❌ 无法连接到页面\n解决方案：\n1. 刷新KIMI页面\n2. 重新加载插件\n3. 确保在正确的页面', 'error');
        return;
      }
  
      // 确认开始
      const confirmMessage = `确定要开始自动问答吗？\n\n将自动处理 ${AppState.questions.length} 个问题\n预计耗时: ${Math.ceil(AppState.questions.length * 1.5)} 分钟\n\n⚠️ 请确保：\n1. kimi页面保持活跃\n2. 网络连接稳定\n3. 不要关闭浏览器标签页`;
      
      if (!confirm(confirmMessage)) {
        return;
      }
  
      // 🔥 关键修复：设置状态并立即更新UI，同时设置startTime
      const taskId = AppState.generateTaskId();
      const currentTime = Date.now();
      
      await AppState.updateState({
        currentTaskId: taskId,
        isCollecting: true,
        startTime: currentTime, // 🔥 确保startTime被正确设置
        isStopping: false
      });
      
      console.log('📊 状态已设置，立即更新UI...');
      updateButtonStates(); // 🔥 立即更新UI，不等background
  
      // 通知background任务开始
      chrome.runtime.sendMessage({
        action: 'taskStart',
        taskId: AppState.currentTaskId,
        type: 'autoCollection',
        tabId: tabId
      });
  
      // 显示开始状态
      showStatus(`🤖 自动问答已启动！\n📊 将处理 ${AppState.questions.length} 个问题\n⏳ 预计耗时 ${Math.ceil(AppState.questions.length * 1.5)} 分钟\n⚠️ 请保持页面活跃，不要关闭标签页`, 'auto', 0);
  
      // 🔥 修复：延迟启动实际任务，给UI足够时间更新
      setTimeout(async () => {
        try {
          // 执行启动自动收集
          const result = await startAutoCollectionTask(tabId, AppState.currentTaskId, AppState.questions);
  
          if (!result.success) {
            console.error('启动自动问答失败:', result.error);
            showStatus(`❌ 启动自动问答失败: ${result.error}`, 'error');
            await AppState.reset();
            updateButtonStates();
          } else {
            console.log('✅ 自动收集已成功启动，等待后台处理完成');
            showStatus(`🤖 自动问答进行中...\n📊 将处理 ${AppState.questions.length} 个问题\n⏳ 任务已在后台启动\n⚠️ 请保持页面活跃，完成后会自动导出`, 'auto', 0);
          }
        } catch (error) {
          console.error('启动任务异常:', error);
          showStatus(`❌ 启动异常: ${error.message}`, 'error');
          await AppState.reset();
          updateButtonStates();
        }
      }, 500); // 延迟500ms启动实际任务
  
    } catch (error) {
      console.error('💥 启动自动收集失败:', error);
      showStatus(`❌ 启动失败: ${error.message}`, 'error');
      await AppState.reset();
      updateButtonStates();
    }
  }

  // 停止收集（修改版 - 支持停止前导出已收集数据）
  async function stopCollection() {
    try {
      console.log('🛑 开始停止收集...');
      
      if (!AppState.isCollecting || !AppState.currentTaskId || AppState.isStopping) {
        if (AppState.isStopping) {
          showStatus('⚠️ 正在停止中，请稍候...', 'info');
        } else {
          showStatus('⚠️ 当前没有正在进行的自动问答任务', 'info');
        }
        return;
      }
  
      // 🔥 修改确认消息，告知会先导出已收集数据
      const confirmMessage = '确定要停止自动问答吗？\n\n📋 停止操作将：\n• 立即停止当前问答处理\n• 导出已收集的数据到CSV文件\n• 保留设置以便继续使用\n\n💡 如果想保留设置继续任务，请等待当前任务完成';
      
      if (!confirm(confirmMessage)) {
        return;
      }
  
      // 立即设置停止状态（UI层面）
      await AppState.updateState({ isStopping: true });
      updateButtonStates();
  
      console.log('🛑 用户手动停止自动问答任务:', AppState.currentTaskId);
      
      showStatus('🛑 正在停止自动问答任务...\n📊 正在保存已收集数据...\n⏳ 请稍候...', 'info', 0);
  
      // 🔥 关键修改：步骤1 - 先获取并导出已收集的数据（在发送停止信号之前）
      let hasExportedData = false;
      let collectedDataResult = null;
      
      try {
        console.log('📊 优先获取当前已收集的数据...');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          // 🔥 在发送任何停止信号之前先获取数据
          collectedDataResult = await getCurrentCollectedDataFromTab(tab.id);
          
          if (collectedDataResult.success && collectedDataResult.data && collectedDataResult.data.length > 0) {
            console.log(`📊 成功获取到 ${collectedDataResult.totalRecords} 条已收集数据`);
            
            showStatus('🛑 正在停止自动问答任务...\n💾 正在导出已收集数据...\n⏳ 请稍候...', 'info', 0);
            
            // 🔥 立即发送 taskComplete 消息进行导出，添加 isStopExport 标志
            chrome.runtime.sendMessage({
              action: 'taskComplete',
              taskId: AppState.currentTaskId,
              success: true,
              data: collectedDataResult.data,
              isStopExport: true, // 🔥 关键标志：标识这是停止时的导出
              stopExportInfo: {
                questionsCount: collectedDataResult.questionsCount,
                totalRecords: collectedDataResult.totalRecords
              }
            });
            
            // 🔥 设置导出状态，但暂不清理数据
            await AppState.updateExportStatus({
              autoExportAttempted: true,
              dataAwaitingExport: true
            });
            
            hasExportedData = true;
            console.log('✅ 已收集数据导出请求已发送');
            
          } else {
            console.log('📊 未发现已收集数据或数据为空');
            console.log('数据获取结果:', collectedDataResult);
          }
        }
      } catch (dataError) {
        console.warn('💥 获取已收集数据失败:', dataError);
        // 不中断停止流程，继续执行停止操作
      }
  
      // 🔥 步骤2：现在才发送停止信号到所有组件
      console.log('🛑 数据保存完成，开始发送停止信号...');
      
      if (hasExportedData) {
        showStatus('🛑 正在停止自动问答任务...\n✅ 已收集数据导出中...\n🛑 正在停止所有组件...\n⏳ 请稍候...', 'info', 0);
      } else {
        showStatus('🛑 正在停止自动问答任务...\n📄 未发现已收集数据\n🛑 正在停止所有组件...\n⏳ 请稍候...', 'info', 0);
      }
  
      // 2.1 通知background停止任务
      console.log('🛑 通知background停止任务...');
      chrome.runtime.sendMessage({
        action: 'stopTask',
        taskId: AppState.currentTaskId,
        reason: '用户手动停止'
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('通知background停止失败:', chrome.runtime.lastError);
        } else {
          console.log('background停止响应:', response);
        }
      });
  
      // 2.2 通知content script停止任务
      console.log('🛑 通知content script停止任务...');
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'stopCollection',
            taskId: AppState.currentTaskId
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('通知content script停止失败:', chrome.runtime.lastError);
            } else {
              console.log('content script停止响应:', response);
            }
          });
        }
      } catch (contentError) {
        console.warn('发送content script停止信号失败:', contentError);
      }
  
      // 🔥 步骤3：延迟重置状态，但不清空数据（等待用户确认导出）
      console.log('⏳ 等待导出和停止操作完成...');
      setTimeout(async () => {
        console.log('🔄 重置任务状态，但保留数据...');
        
        // 只重置任务相关状态，保留数据
        await AppState.updateState({
          isStopping: false,
          isCollecting: false,
          currentTaskId: null
        });
        
        // 更新按钮状态
        updateButtonStates();
        
        // 🔥 根据是否导出了数据显示不同的完成消息
        let stopMessage;
        if (hasExportedData) {
          stopMessage = '✅ 自动问答已停止\n💾 已收集数据正在导出...\n📋 导出完成后可选择：\n• 点击"导出待保存数据"确认保存\n• 点击"清空数据"释放空间\n💡 可重新上传文件开始新任务';
        } else {
          stopMessage = '✅ 自动问答已停止\n📄 未发现已收集数据\n💡 可重新上传文件开始新任务';
        }
  
        showStatus(stopMessage, 'success', 0); // 0表示不自动隐藏，让用户看到选项
        
        console.log('✅ 自动问答任务停止流程完成，数据已保留');
        
      }, hasExportedData ? 3000 : 2000); // 如果有导出数据，等待更长时间
  
    } catch (error) {
      console.error('💥 停止自动问答任务失败:', error);
      showStatus(`❌ 停止任务失败: ${error.message}\n🔄 正在强制重置状态...`, 'error', 5000);
      
      // 即使停止失败，也要重置本地状态
      setTimeout(async () => {
        await AppState.reset(); // 只重置任务状态，保留数据
        updateButtonStates();
      }, 2000);
    }
  }

  // 手动完成收集并导出
  async function finishAndExportCollection() {
    try {
      console.log('📋 开始手动完成收集并导出...');
      
      if (AppState.isCollecting) {
        showStatus('⚠️ 自动问答正在进行中，请等待完成或先停止', 'warning');
        return;
      }
  
      // 检查是否有待导出数据
      if (AppState.exportStatus.dataAwaitingExport) {
        const confirmMessage = '检测到有待导出的数据\n\n这些数据是刚才停止任务时保留的，确定要导出吗？\n\n✅ 导出后数据将被清理';
        
        if (!confirm(confirmMessage)) {
          return;
        }
      } else if (!AppState.hasCollectedData) {
        showStatus('⚠️ 还没有收集到任何数据', 'info');
        return;
      } else {
        const confirmMessage = '确定要导出当前收集的数据吗？';
        
        if (!confirm(confirmMessage)) {
          return;
        }
      }
  
      // 禁用导出按钮，防止重复点击
      elements.finishAndExportBtn.disabled = true;
      elements.finishAndExportBtn.textContent = '📄 导出中...';
  
      console.log('用户手动导出数据');
      
      showStatus('📋 正在准备导出数据...', 'info');
  
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('无法获取当前页面标签');
      }
  
      // 先测试连接
      showStatus('📋 正在检查页面连接...', 'info');
      const tabId = await testConnection();
      if (!tabId) {
        throw new Error('无法连接到Kimi页面，请刷新页面后重试');
      }
  
      showStatus('📋 正在获取并导出数据...', 'info');
      const result = await finishAndExportCollectionTask(tab.id, 'manual_export');
  
      if (result.success) {
        if (result.data && result.data.length > 0) {
          const questionsCount = new Set(result.data.map(item => item.问题)).size;
          const sourcesCount = result.data.filter(item => item.网站url && item.网站url.trim()).length;
          
          showStatus(
            `✅ 手动导出完成！\n📊 导出了 ${questionsCount} 个问答对，${sourcesCount} 个网址\n💾 CSV文件已保存到下载文件夹\n🧹 是否需要清空数据？`, 
            'success', 
            0  // 不自动隐藏，让用户选择
          );
          
          // 更新导出状态
          await AppState.updateExportStatus({
            autoExportSuccess: true,
            dataAwaitingExport: false,
            lastExportError: null
          });
          
          // 发送任务完成通知
          chrome.runtime.sendMessage({
            action: 'taskComplete',
            taskId: 'manual_export',
            success: true,
            data: result.data
          });
          
        } else {
          showStatus('✅ 导出完成！\n📄 生成了空数据文件\n💾 CSV文件已保存到下载文件夹', 'success', 8000);
          
          // 即使是空数据也更新导出状态
          await AppState.updateExportStatus({
            autoExportSuccess: true,
            dataAwaitingExport: false
          });
        }
      } else {
        showStatus(`❌ 手动导出失败: ${result.error}`, 'error');
        
        // 记录导出错误
        await AppState.updateExportStatus({
          lastExportError: result.error
        });
      }
  
    } catch (error) {
      console.error('💥 手动导出失败:', error);
      showStatus(`❌ 导出失败: ${error.message}`, 'error');
      
      // 记录导出错误
      await AppState.updateExportStatus({
        lastExportError: error.message
      });
    } finally {
      // 重置导出按钮状态
      elements.finishAndExportBtn.disabled = false;
      updateButtonStates(); // 重新计算按钮文本和样式
    }
  }

  // 检测并修复僵尸状态
  async function detectAndFixZombieState() {
    console.log('🔍 检测僵尸状态...');
    
    let stateFixed = false;
    
    // 检查停止状态
    if (AppState.isStopping) {
      console.log('⚠️ 检测到停止状态，验证是否为僵尸状态...');
      
      // 尝试与background同步
      const backgroundSynced = await syncWithBackground();
      
      // 如果同步后仍然是停止状态，且距离上次更新时间较长，认为是僵尸状态
      if (AppState.isStopping) {
        const lastUpdate = AppState.lastProgressUpdate || { timestamp: AppState.startTime };
        const timeSinceUpdate = Date.now() - (lastUpdate.timestamp || Date.now() - 60000);
        
        if (timeSinceUpdate > 60000) { // 超过1分钟
          console.log('🧟 检测到僵尸停止状态，强制清理');
          
          await AppState.updateState({
            isStopping: false,
            isCollecting: false
          });
          
          showStatus('⚠️ 检测到停止状态异常，已自动清理\n💡 可以正常使用插件了', 'warning', 5000);
          stateFixed = true;
        }
      }
    }
    
    return stateFixed;
  }

  // 添加强制重置按钮功能
  function addForceResetButton() {
    // 创建强制重置按钮（仅在异常状态下显示）
    const forceResetBtn = document.createElement('button');
    forceResetBtn.id = 'forceReset';
    forceResetBtn.className = 'button button-force-reset';
    forceResetBtn.style.display = 'none';
    forceResetBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #5a6268 100%)';
    forceResetBtn.innerHTML = '🔧 强制重置状态';
    
    // 插入到清空按钮前面
    if (elements.clearDataBtn) {
      elements.clearDataBtn.parentNode.insertBefore(forceResetBtn, elements.clearDataBtn);
    } else {
      // 如果没有清空按钮，插入到最后
      document.body.appendChild(forceResetBtn);
    }
    
    // 添加点击事件
    forceResetBtn.addEventListener('click', async function() {
      const confirmed = confirm('强制重置将清空所有状态和数据，确定继续吗？\n\n此操作用于修复插件异常状态。');
      
      if (confirmed) {
        console.log('🔧 用户选择强制重置');
        
        // 强制清理所有状态
        await AppState.fullReset();
        clearFileInput();
        
        // 通知background强制清理
        chrome.runtime.sendMessage({ action: 'forceCleanupAllTasks' });
        
        updateButtonStates();
        showStatus('✅ 强制重置完成\n💡 所有状态已清空，可以重新开始', 'success', 5000);
        
        // 隐藏强制重置按钮
        forceResetBtn.style.display = 'none';
      }
    });
    
    return forceResetBtn;
  }

  // 🔥 新增：从标签页获取当前已收集数据的辅助函数
  async function getCurrentCollectedDataFromTab(tabId) {
    return new Promise((resolve) => {
      console.log(`📊 向标签页 ${tabId} 发送获取数据请求...`);
      
      const timeout = setTimeout(() => {
        console.error('⏰ 获取已收集数据超时');
        resolve({ 
          success: false, 
          error: '获取已收集数据超时',
          data: [],
          questionsCount: 0,
          totalRecords: 0
        });
      }, 8000);
      
      chrome.tabs.sendMessage(tabId, { 
        action: 'getCurrentCollectedData'
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          console.error('💥 获取数据失败:', chrome.runtime.lastError);
          resolve({ 
            success: false, 
            error: chrome.runtime.lastError.message,
            data: [],
            questionsCount: 0,
            totalRecords: 0
          });
        } else {
          console.log('📊 获取数据响应:', response);
          resolve(response || { 
            success: false, 
            error: '无响应',
            data: [],
            questionsCount: 0,
            totalRecords: 0
          });
        }
      });
    });
  }

  // 添加清空数据功能
  function confirmAndClearData() {
    const hasQuestions = AppState.questions.length > 0;
    const hasData = AppState.hasCollectedData;
    const hasAwaitingData = AppState.exportStatus.dataAwaitingExport;
    
    let confirmMessage = '确定要清空所有数据吗？\n\n⚠️ 此操作将清空：\n';
    
    if (hasQuestions) {
      confirmMessage += `• 已上传的 ${AppState.questions.length} 个问题\n`;
    }
    if (hasData) {
      confirmMessage += '• 已收集的问答数据\n';
    }
    if (hasAwaitingData) {
      confirmMessage += '• 待导出的数据（尚未保存）\n';
    }
    
    confirmMessage += '\n此操作不可撤销！';
    
    // 🔥 如果有待导出数据，额外警告
    if (hasAwaitingData) {
      confirmMessage += '\n\n⚠️ 特别提醒：您有未导出的数据，清空后将无法恢复！\n建议先点击"导出待保存数据"。';
    }
    
    if (confirm(confirmMessage)) {
      console.log('🧹 用户确认清空所有数据');
      performFullClear();
    }
  }

  async function performFullClear() {
    try {
      console.log('🧹 开始执行完全清空操作...');
      
      // 1. 完全重置状态
      await AppState.fullReset();
      
      // 2. 清空文件输入UI
      clearFileInput();
      
      // 3. 更新按钮状态
      updateButtonStates();
      
      // 4. 显示清空完成消息
      showStatus('✅ 所有数据已清空\n💡 可以重新上传问题文件开始新任务', 'success', 5000);
      
      console.log('✅ 完全清空操作完成');
      
    } catch (error) {
      console.error('💥 清空操作失败:', error);
      showStatus(`❌ 清空失败: ${error.message}`, 'error');
    }
  }

  // 监听来自background的消息
  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (AppState.isStopping && !['taskComplete'].includes(request.action)) {
      console.log(`⚠️ 正在停止中，忽略消息: ${request.action}`);
      return;
    }
    
    if (request.action === 'autoQuestionProgress') {
      const progress = request.progress;
      console.log('收到自动问答进度更新:', progress);
      
      if (AppState.isStopping) {
        return;
      }
      
      // 保存最新进度信息
      AppState.updateState({ lastProgressUpdate: progress });
      
      // 更新状态显示
      const statusText = `🤖 自动问答进行中...\n📊 进度: ${progress.current}/${progress.total}\n💬 ${progress.message}\n⚠️ 请勿关闭KIMI页面`;
      
      showStatus(statusText, 'auto', 0);
      
    } else if (request.action === 'taskComplete') {
      console.log('收到任务完成通知:', request);
    
      if (request.success) {
        const questionsCount = request.data ? new Set(request.data.map(item => item.问题)).size : 0;
        const sourcesCount = request.data ? request.data.filter(item => item.网站url && item.网站url.trim()).length : 0;
        
        // 🔥 检查是否是停止导出
        if (request.isStopExport) {
          console.log('📋 这是停止时的导出操作');
          
          // 更新导出状态
          AppState.updateExportStatus({
            autoExportAttempted: true,
            autoExportSuccess: true,
            dataAwaitingExport: false,
            lastExportError: null
          });
          
          // 显示停止导出完成消息
          showStatus(`✅ 停止导出完成！\n📊 已保存 ${questionsCount} 个问答对\n🔗 包含 ${sourcesCount} 个网址\n💾 CSV文件已保存到下载文件夹\n💡 任务已完全停止，可开始新任务`, 'success', 0);
          
          // 不自动清空数据，让用户选择
          updateButtonStates();
          
        }  else {
          console.log('🔋 这是正常完成的导出操作');
          
          showStatus(`✅ 自动问答完成！\n📊 共收集 ${questionsCount} 个问答对\n🔗 包含 ${sourcesCount} 个网址\n💾 CSV文件已自动保存到下载文件夹\n\n🔋 任务已完成，您可以选择：\n• 点击"手动导出数据"重新导出\n• 点击"清空数据"开始新任务`, 'success', 0); // 0表示不自动隐藏
          
          // 🔥 关键修改：正常完成后不自动清空，而是保留数据状态让用户选择
          console.log('🔋 正常任务完成，保留数据状态供用户选择后续操作...');
          
          // 更新状态：标记任务完成但保留数据
          await AppState.updateState({
            isCollecting: false,
            isStopping: false,
            currentTaskId: null,
            hasCollectedData: true  // 🔥 关键：确保hasCollectedData为true
          });
          
          // 更新导出状态：标记自动导出已完成，但数据仍可用
          await AppState.updateExportStatus({
            autoExportAttempted: true,
            autoExportSuccess: true,
            dataAwaitingExport: false,  // 自动导出已完成，但用户仍可手动导出
            lastExportError: null
          });
          
          // 🔥 重要：更新按钮状态，这会显示"手动导出数据"和"清空数据"按钮
          updateButtonStates();
          
          console.log('✅ 正常任务完成处理完毕，数据已保留，用户可选择后续操作');
          
          // 🔥 移除原来的自动清空逻辑
          // 不再执行 performFullClear()，让用户自己决定是否清空
        }
        
      } else {
        showStatus(`❌ 自动问答失败: ${request.error || '未知错误'}`, 'error', 8000);
        
        // 🔥 记录导出错误
        AppState.updateExportStatus({
          autoExportAttempted: true,
          autoExportSuccess: false,
          lastExportError: request.error
        });
        
        // 失败时也要重置状态，但保留文件数据以便重试
        AppState.reset();
        updateButtonStates();
      }
    }
  });

  // Excel文件处理功能
  if (elements.excelFile) {
    console.log('🔧 绑定文件选择事件...');
    
    elements.excelFile.addEventListener('change', function(event) {
      console.log('📁 文件选择事件触发');
      
      const file = event.target.files[0];
      if (!file) {
        console.log('📁 未选择文件，清理状态');
        if (elements.fileInfo) elements.fileInfo.classList.remove('show');
        AppState.updateState({ questions: [] });
        updateButtonStates();
        return;
      }

      console.log('选择的文件:', file.name, file.type);
      
      // 显示文件信息
      if (elements.fileName) elements.fileName.textContent = `文件名: ${file.name}`;
      if (elements.fileInfo) elements.fileInfo.classList.add('show');
      
      // 读取文件
      readExcelFile(file);
    });
    
    console.log('✅ 文件选择事件已绑定');
  }

  // 使用SheetJS读取Excel文件
  async function readExcelFile(file) {
    try {
      showStatus('📖 正在读取文件...', 'info');
      
      // 根据文件类型选择解析方式
      if (file.name.toLowerCase().endsWith('.csv')) {
        await readCSVFile(file);
      } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        await readExcelFileWithSheetJS(file);
      } else {
        throw new Error('不支持的文件格式，请使用 .xlsx、.xls 或 .csv 文件');
      }
      
    } catch (error) {
      console.error('读取文件失败:', error);
      showStatus(`❌ 文件读取失败: ${error.message}\n\n请确保：\n1. 文件格式正确(.xlsx, .xls, .csv)\n2. 第一列包含问题数据\n3. 文件没有密码保护`, 'error');
      
      AppState.updateState({ questions: [] });
      updateButtonStates();
    }
  }

  // 读取CSV文件
  async function readCSVFile(file) {
    const text = await file.text();
    
    // 检测并处理可能的BOM
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/);
    
    if (lines.length < 2) {
      throw new Error('CSV文件内容不足，至少需要标题行和一行数据');
    }
    
    const questions = [];
    
    // 从第二行开始读取（跳过标题）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        // 智能CSV解析，支持逗号、分号、制表符分隔
        let columns;
        if (line.includes('\t')) {
          columns = line.split('\t');
        } else if (line.includes(';')) {
          columns = line.split(';');
        } else {
          columns = line.split(',');
        }
        
        const question = columns[0] ? columns[0].replace(/^["']|["']$/g, '').trim() : '';
        if (question && question !== '') {
          questions.push(question);
        }
      }
    }
    
    if (questions.length === 0) {
      throw new Error('未找到有效的问题数据');
    }
    
    console.log('CSV解析成功，提取到问题:', questions);
    processQuestions(questions);
  }

  // 使用SheetJS读取Excel文件
  async function readExcelFileWithSheetJS(file) {
    // 检查SheetJS是否可用
    if (typeof XLSX === 'undefined') {
      throw new Error('Excel解析库未加载，请刷新页面重试或使用CSV格式');
    }
    
    console.log('开始使用SheetJS解析Excel文件:', file.name);
    
    try {
      // 读取文件为ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // 使用SheetJS解析，专门配置中文支持
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array',
        cellText: true,      // 确保文本正确解析
        cellDates: true,     // 处理日期格式
        raw: false,          // 不使用原始值，确保文本格式正确
        codepage: 65001,     // UTF-8编码支持
        cellStyles: true     // 支持样式读取
      });
      
      console.log('Excel文件解析成功，工作表列表:', workbook.SheetNames);
      
      // 获取第一个工作表
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // 调试工作表结构
      debugExcelStructure(workbook, worksheet);
      
      // 转换为JSON，优化中文处理
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,           // 使用数组格式，便于处理
        defval: '',         // 空单元格默认值
        raw: false,         // 确保文本格式，对中文重要
        dateNF: 'yyyy-mm-dd', // 日期格式化
        blankrows: false    // 跳过空行
      });
      
      console.log('Excel数据转换完成，行数:', jsonData.length);
      console.log('前3行数据预览:', jsonData.slice(0, 3));
      
      if (jsonData.length < 2) {
        throw new Error('Excel文件内容不足，至少需要标题行和一行数据');
      }
      
      // 检查是否包含中文内容
      const hasChineseContent = jsonData.some(row => 
        row.some(cell => cell && /[\u4e00-\u9fa5]/.test(cell.toString()))
      );
      console.log('检测到中文内容:', hasChineseContent);
      
      // 提取中文问题
      const questions = extractChineseQuestionsFromExcel(jsonData);
      
      if (questions.length === 0) {
        throw new Error('未找到有效的问题数据\n请确保第一列包含问题内容');
      }
      
      console.log(`成功提取 ${questions.length} 个问题:`, questions);
      processQuestions(questions);
      
    } catch (error) {
      console.error('SheetJS解析失败:', error);
      throw new Error(`Excel文件解析失败: ${error.message}`);
    }
  }

  // 从Excel数据中提取问题
  function extractChineseQuestionsFromExcel(jsonData) {
    const questions = [];
    
    if (jsonData.length < 1) {
      throw new Error('Excel文件为空');
    }
    
    // 获取标题行
    const headers = jsonData[0];
    console.log('Excel表头:', headers);
    
    // 智能识别问题列（支持中文标题）
    let questionColumnIndex = 0;
    const questionHeaders = [
      '问题', '问题列表', '题目', '问题内容', '提问',
      'question', 'Question', 'QUESTION',
      'query', 'Query', 'QUERY'
    ];
    
    // 查找最匹配的问题列
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i] ? headers[i].toString().trim() : '';
      for (const questionHeader of questionHeaders) {
        if (header.includes(questionHeader)) {
          questionColumnIndex = i;
          console.log(`智能识别到问题列: "${header}" (第${i+1}列)`);
          break;
        }
      }
    }
    
    console.log(`使用第 ${questionColumnIndex + 1} 列作为问题列`);
    
    // 提取问题内容
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row && row.length > questionColumnIndex && row[questionColumnIndex]) {
        const question = row[questionColumnIndex].toString().trim();
        if (question && question !== '' && question !== 'undefined') {
          questions.push(question);
          console.log(`提取问题 ${questions.length}: ${question}`);
        }
      }
    }
    
    return questions;
  }

  // 调试Excel结构
  function debugExcelStructure(workbook, worksheet) {
    console.log('=== Excel文件结构调试信息 ===');
    console.log('工作表数量:', workbook.SheetNames.length);
    console.log('当前工作表:', workbook.SheetNames[0]);
    
    if (worksheet['!ref']) {
      console.log('数据范围:', worksheet['!ref']);
      
      // 分析数据范围
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      console.log(`数据区域: ${range.e.r + 1} 行 × ${range.e.c + 1} 列`);
      
      // 检查前几个单元格的内容
      console.log('=== 单元格内容检查 ===');
      for (let row = 0; row <= Math.min(2, range.e.r); row++) {
        for (let col = 0; col <= Math.min(3, range.e.c); col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress];
          if (cell) {
            console.log(`${cellAddress}: "${cell.w || cell.v || ''}" (类型: ${cell.t})`);
          }
        }
      }
    } else {
      console.warn('工作表似乎为空或无有效数据范围');
    }
  }

  // 处理解析出的问题
  async function processQuestions(questions) {
    await AppState.updateState({ questions: questions });
    
    // 更新显示
    if (elements.questionCount) elements.questionCount.textContent = `问题数量: ${questions.length} 个`;
    
    // 检查是否包含中文
    const chineseQuestions = questions.filter(q => /[\u4e00-\u9fa5]/.test(q));
    const chineseRatio = (chineseQuestions.length / questions.length * 100).toFixed(1);
    
    showStatus(`✅ 文件读取成功！\n共找到 ${questions.length} 个问题\n其中 ${chineseQuestions.length} 个包含中文 (${chineseRatio}%)\n可以开始自动问答了`, 'success', 5000);
    
    updateButtonStates();
  }

  // 绑定按钮事件监听器
  try {
    console.log('🔧 开始绑定按钮事件监听器...');
    
    console.log('绑定开始自动收集按钮...');
    elements.startAutoCollectionBtn.addEventListener('click', async function() {
      console.log('🖱️ 开始自动收集按钮被点击');
      if (AppState.isCollecting || AppState.isStopping) {
        showStatus('⚠️ 任务正在运行或停止中', 'info');
        return;
      }
      await startAutoCollection();
    });

    console.log('绑定手动导出按钮...');
    elements.finishAndExportBtn.addEventListener('click', function() {
      console.log('🖱️ 手动导出按钮被点击');
      finishAndExportCollection();
    });
    
    console.log('绑定停止收集按钮...');
    elements.stopCollectionBtn.addEventListener('click', function() {
      console.log('🖱️ 停止收集按钮被点击');
      stopCollection();
    });

    // 🔥 新增：绑定清空数据按钮
    if (elements.clearDataBtn) {
      console.log('绑定清空数据按钮...');
      elements.clearDataBtn.addEventListener('click', function() {
        console.log('🖱️ 清空数据按钮被点击');
        confirmAndClearData();
      });
    }

    console.log('✅ 所有事件监听器已绑定');
  } catch (error) {
    console.error('💥 绑定事件监听器失败:', error);
    showStatus('❌ 界面初始化失败，请刷新页面', 'error');
    return;
  }

  // 通信函数
  async function startAutoCollectionTask(tabId, taskId, questions) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: '启动自动收集响应超时' });
      }, 10000);
      
      chrome.tabs.sendMessage(tabId, { 
        action: 'startAutoCollection',
        taskId: taskId,
        questions: questions
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: '无响应' });
        }
      });
    });
  }

  async function finishAndExportCollectionTask(tabId, taskId) {
    return new Promise((resolve) => {
      let resolved = false;
      const resolveOnce = (result) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          console.error('⏰ 手动导出整体超时');
          resolveOnce({ 
            success: false, 
            error: '导出操作超时，请检查：1) Kimi页面是否响应正常 2) 网络连接是否稳定 3) 是否有大量数据需要处理' 
          });
        }
      }, 45000); // 增加到45秒超时
      
      // 添加连接检查
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (pingResponse) => {
        if (chrome.runtime.lastError) {
          clearTimeout(timeout);
          resolveOnce({ 
            success: false, 
            error: `无法连接到页面：${chrome.runtime.lastError.message}。请刷新Kimi页面后重试。` 
          });
          return;
        }
        
        if (!pingResponse || !pingResponse.success) {
          clearTimeout(timeout);
          resolveOnce({ 
            success: false, 
            error: '页面连接异常，请刷新Kimi页面后重试' 
          });
          return;
        }
        
        // 连接正常，发送导出请求
        chrome.tabs.sendMessage(tabId, { 
          action: 'finishAndExportCollection',
          taskId: taskId
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            resolveOnce({ 
              success: false, 
              error: `导出请求失败：${chrome.runtime.lastError.message}` 
            });
          } else {
            resolveOnce(response || { 
              success: false, 
              error: '导出请求无响应，可能是页面脚本未正确加载' 
            });
          }
        });
      });
    });
  }

  // 主初始化流程
  async function initialize() {
    try {
      console.log('🚀 开始初始化UI...');
      
      // 1. 恢复保存的状态
      console.log('💾 恢复保存的状态...');
      const stateRestored = await AppState.loadState();
      
      // 🔥 关键修复：如果恢复了运行状态，先更新UI再同步
      if (stateRestored && (AppState.isCollecting || AppState.isStopping)) {
        console.log('🔄 检测到运行状态，先更新UI再同步background...');
        updateButtonStates();
        updateFileInfoDisplay();
        restoreRunningStateDisplay();
        
        // 延迟与background同步，避免过早清理状态
        setTimeout(async () => {
          console.log('🔄 延迟与background同步状态...');
          const backgroundSynced = await syncWithBackground();
          if (backgroundSynced) {
            updateButtonStates();
          }
        }, 2000); // 延迟2秒同步
        
      } else {
        // 2. 正常情况下的同步
        console.log('🔄 与background同步状态...');
        const backgroundSynced = await syncWithBackground();
        
        // 3. 检测并修复僵尸状态
        console.log('🔍 检测僵尸状态...');
        const zombieFixed = await detectAndFixZombieState();
        
        // 5. 更新UI显示
        console.log('🎨 更新UI显示...');
        updateButtonStates();
        updateFileInfoDisplay();
        
        if (backgroundSynced) {
          restoreRunningStateDisplay();
        } else {
          // 显示初始状态
          showStatus('🚀 Kimi自动问答器已就绪\n💡 使用步骤：\n1. 上传Excel文件，第一列为问题列表\n2. 点击"开始自动问答"进行批量问答\n3. 完成后会自动导出包含答案的CSV文件\n\n请确保在Kimi聊天页面使用', 'info', 10000);
        }
        
        if (zombieFixed) {
          setTimeout(() => {
            showStatus('✅ 已自动修复异常状态\n💡 插件现在可以正常使用了', 'success', 5000);
          }, 1000);
        }
      }
      
      // 4. 添加强制重置按钮
      const forceResetBtn = addForceResetButton();
      
      console.log('✅ Popup初始化完成');
    } catch (error) {
      console.error('💥 初始化UI失败:', error);
      showStatus('❌ 界面初始化失败，请刷新页面', 'error');
    }
  }
  

  // 执行初始化
  initialize();
});