// 内容脚本 - Kimi自动模式专用版
(function() {
  'use strict';
  
  console.log('Kimi自动采集器 Content Script 已加载');
  
  let isReady = false;
  let injectScriptLoaded = false;
  let initializationAttempts = 0;
  const MAX_INIT_ATTEMPTS = 3;
  
  // 当前任务状态
  let currentTask = {
    id: null,
    type: null,
    startTime: null,
    isAutoMode: false
  };

  // 停止状态管理
  let isStopping = false;
  
  // 注入脚本
  function injectScript() {
    if (injectScriptLoaded) return;
  
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject.js');
      script.onload = function() {
        injectScriptLoaded = true;
        console.log('✅ Inject script 加载成功');
      };
      script.onerror = function() {
        console.error('Inject script 加载失败');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error('注入脚本失败:', error);
    }
  }
  
  // 初始化函数
  function initialize() {
    if (isReady) return;
    
    initializationAttempts++;
    console.log(`Kimi自动采集器初始化中... (尝试 ${initializationAttempts}/${MAX_INIT_ATTEMPTS})`);
  
    // 检查是否在正确的页面 - Kimi专用
    if (!window.location.href.includes('kimi.com')) {
      if (initializationAttempts < MAX_INIT_ATTEMPTS) {
        setTimeout(initialize, 2000);
      }
      return;
    }
  
    // 注入脚本
    injectScript();
    isReady = true;
  
    // 向background script发送准备就绪消息
    try {
      chrome.runtime.sendMessage({action: 'contentScriptReady'}, (response) => {
        if (chrome.runtime.lastError) {
          console.log('发送准备消息失败:', chrome.runtime.lastError);
        } else {
          console.log('内容脚本准备就绪');
        }
      });
    } catch (error) {
      console.error('发送准备消息异常:', error);
    }
  }
  
  // 向background发送任务状态更新
  function notifyTaskStatus(action, data = {}) {
    try {
      chrome.runtime.sendMessage({
        action: action,
        taskId: currentTask.id,
        ...data
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log(`发送任务状态更新失败 (${action}):`, chrome.runtime.lastError);
        } else {
          console.log(`任务状态更新成功 (${action}):`, response);
        }
      });
    } catch (error) {
      console.error(`发送任务状态异常 (${action}):`, error);
    }
  }
  
  // 监听来自inject script的消息
  window.addEventListener('message', function(event) {
    if (event.data.type === 'KIMI_COLLECT_RESPONSE') {
      const { action, success, data, error } = event.data;
  
      if (window.pendingResponse) {
        if (success) {
          window.pendingResponse({ success: true, data: data });
        } else {
          window.pendingResponse({ success: false, error: error });
        }
        window.pendingResponse = null;
      }
    }
    
    // 监听自动收集完成消息
    else if (event.data.type === 'AUTO_COLLECTION_COMPLETE') {
      const { taskId, success, data, error, message } = event.data;
      console.log('🏁 收到自动收集完成通知:', { taskId, success, dataLength: data?.length });
      
      // 验证是否是当前任务
      if (currentTask.id === taskId && currentTask.isAutoMode) {
        console.log('✅ 确认是当前自动收集任务，发送完成通知到background');
        
        // 发送任务完成通知到background
        notifyTaskStatus('taskComplete', {
          success: success,
          data: data,
          error: error
        });
        
        // 清理当前任务状态
        clearCurrentTask();
        
        console.log('🧹 自动收集任务状态已清理');
      } else {
        console.warn('⚠️ 收到的完成通知与当前任务不匹配:', {
          currentTaskId: currentTask.id,
          messageTaskId: taskId,
          isAutoMode: currentTask.isAutoMode
        });
      }
    }
    
    // 监听自动问答进度更新
    else if (event.data.type === 'AUTO_QUESTION_PROGRESS') {
      const progress = event.data.progress;
      console.log('🤖 自动问答进度更新:', progress);
      
      // 转发进度更新到popup
      if (currentTask.isAutoMode && currentTask.id) {
        notifyTaskStatus('autoQuestionProgress', { 
          progress: {
            current: progress.current,
            total: progress.total,
            message: progress.message,
            question: progress.question
          }
        });
      }
    }
    
    // 监听URL提取进度更新
    else if (event.data.type === 'URL_EXTRACTION_PROGRESS') {
      const progress = event.data.progress;
      console.log('🔗 URL提取进度更新:', progress);
      
      // 转发URL提取进度到popup
      if (currentTask.id) {
        notifyTaskStatus('urlExtractionProgress', { 
          progress: progress
        });
      }
    }
  });
  
  // 清理当前任务状态的函数
  function clearCurrentTask() {
    currentTask.id = null;
    currentTask.type = null;
    currentTask.startTime = null;
    currentTask.isAutoMode = false;
    isStopping = false;
  }
  
  // 设置当前任务状态的函数
  function setCurrentTask(taskId, type) {
    currentTask.id = taskId;
    currentTask.type = type;
    currentTask.startTime = Date.now();
    currentTask.isAutoMode = (type === 'autoCollection');
    isStopping = false;
  }
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
    // 立即响应ping请求
    if (request.action === 'ping') {
      sendResponse({ success: true, message: '内容脚本正常工作', isReady: isReady });
      return false;
    }

    // 完成收集并导出
    if (request.action === 'finishAndExportCollection') {
      const taskId = request.taskId;
      
      console.log('完成收集并导出，任务ID:', taskId);
      
      if (injectScriptLoaded) {
        finishAndExportCollectionUsingInject().then(result => {
          console.log('完成收集并导出结果:', result);
          
          if (result.success) {
            // 发送任务完成通知到background
            console.log('📤 发送任务完成通知到background');
            notifyTaskStatus('taskComplete', {
              success: true,
              data: result.data,
              error: null
            });
          } else {
            // 发送任务失败通知到background
            notifyTaskStatus('taskComplete', {
              success: false,
              data: null,
              error: result.error
            });
          }
          
          // 清理任务状态
          clearCurrentTask();
          
          sendResponse(result);
        }).catch(error => {
          console.error('完成收集并导出失败:', error);
          
          // 发送任务失败通知到background
          notifyTaskStatus('taskComplete', {
            success: false,
            data: null,
            error: error.message
          });
          
          // 清理任务状态
          clearCurrentTask();
          
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse({ success: false, error: 'Inject script未加载' });
      }
      
      return true; // 异步响应
    }

    // 停止收集请求处理
    if (request.action === 'stopCollection') {
      const { taskId } = request;
      console.log(`🛑 [ContentScript] 收到停止收集请求: ${taskId}`);
      
      if (currentTask.id === taskId) {
        console.log(`🛑 [ContentScript] 停止当前任务: ${currentTask.id} (类型: ${currentTask.type})`);
        
        // 发送停止信号到inject script
        if (injectScriptLoaded) {
          console.log('🛑 [ContentScript] 向inject script发送停止信号...');
          
          // 延迟发送停止信号，给数据获取更多时间
          setTimeout(() => {
            // 发送停止信号
            window.postMessage({
              type: 'KIMI_COLLECT_STOP',
              taskId: taskId
            }, '*');
            
            console.log('🛑 [ContentScript] 停止信号已发送');
          }, 500); // 延迟500ms
          
          // 延迟清理本地状态
          setTimeout(() => {
            console.log('🧹 [ContentScript] 延迟清理本地任务状态');
            isStopping = true;
            clearCurrentTask();
          }, 1500); // 延迟1.5秒清理
          
          // 快速响应，表示停止信号已安排发送
          sendResponse({ 
            success: true, 
            message: '停止信号已安排发送，任务正在安全终止' 
          });
          
        } else {
          console.warn('⚠️ [ContentScript] Inject script未加载，直接清理本地状态');
          clearCurrentTask();
          sendResponse({ 
            success: true, 
            message: '任务已停止（inject script未就绪）' 
          });
        }
      } else {
        console.log(`⚠️ [ContentScript] 任务ID不匹配: 当前=${currentTask.id}, 请求=${taskId}`);
        sendResponse({ 
          success: false, 
          message: '任务ID不匹配或无活跃任务' 
        });
      }
      
      return false; // 同步响应
    }
  
    // 检查准备状态
    if (!isReady) {
      initialize();
      sendResponse({ success: false, error: '内容脚本未准备就绪，请稍后重试' });
      return false;
    }

    // 开始自动收集
    if (request.action === 'startAutoCollection') {
      const { taskId, questions } = request;
      
      // 检查是否在停止过程中
      if (isStopping) {
        sendResponse({ success: false, error: '任务正在停止中，请稍后重试' });
        return false;
      }
      
      // 设置当前任务信息
      setCurrentTask(taskId, 'autoCollection');
      
      console.log('开始自动收集，任务ID:', currentTask.id, '问题数量:', questions.length);
      
      if (injectScriptLoaded) {
        startAutoCollectionUsingInject(taskId, questions).then(result => {
          console.log('自动收集启动结果:', result);
          
          // 只处理启动结果，不处理完成结果
          // 完成结果将通过AUTO_COLLECTION_COMPLETE消息单独处理
          if (result.success) {
            console.log('✅ 自动收集已成功启动，等待后台完成');
          } else {
            console.error('❌ 自动收集启动失败:', result.error);
            clearCurrentTask();
          }
          
          sendResponse(result);
        }).catch(error => {
          console.error('自动收集启动异常:', error);
          clearCurrentTask();
          sendResponse({ success: false, error: error.message });
        });
      } else {
        console.error('Inject script未加载，无法启动自动收集');
        clearCurrentTask();
        sendResponse({ success: false, error: 'Inject script未加载' });
      }
      
      return true; // 异步响应
    }

    // 获取当前已收集数据
    if (request.action === 'getCurrentCollectedData') {
      console.log('📊 [ContentScript] 收到获取当前已收集数据请求');
      
      if (injectScriptLoaded) {
        getCurrentCollectedDataUsingInject().then(result => {
          console.log('📊 [ContentScript] 获取当前已收集数据结果:', result);
          sendResponse(result);
        }).catch(error => {
          console.error('💥 [ContentScript] 获取当前已收集数据失败:', error);
          sendResponse({ 
            success: false, 
            error: error.message,
            data: [],
            questionsCount: 0,
            totalRecords: 0
          });
        });
      } else {
        console.warn('⚠️ [ContentScript] Inject script未加载，无法获取数据');
        sendResponse({ 
          success: false, 
          error: 'Inject script未加载',
          data: [],
          questionsCount: 0,
          totalRecords: 0
        });
      }
      
      return true; // 异步响应
    }
  });
  
  // 自动收集相关函数
  async function startAutoCollectionUsingInject(taskId, questions) {
    return new Promise((resolve) => {
      window.pendingResponse = resolve;

      window.postMessage({
        type: 'KIMI_COLLECT_REQUEST',
        action: 'startAutoCollection',
        taskId: taskId,
        questions: questions
      }, '*');

      // 超时处理（自动收集需要更长时间）
      setTimeout(() => {
        if (window.pendingResponse) {
          window.pendingResponse = null;
          resolve({ success: false, error: '启动自动收集响应超时' });
        }
      }, 30000);
    });
  }

  async function finishAndExportCollectionUsingInject() {
    return new Promise((resolve) => {
      let resolved = false;
      const resolveOnce = (result) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };
  
      window.pendingResponse = resolveOnce;
  
      window.postMessage({
        type: 'KIMI_COLLECT_REQUEST',
        action: 'finishAndExportCollection'
      }, '*');
  
      // 增加超时时间到15秒，并提供更详细的错误信息
      setTimeout(() => {
        if (!resolved) {
          console.error('⏰ [ContentScript] 手动导出响应超时');
          window.pendingResponse = null;
          resolveOnce({ 
            success: false, 
            error: '手动导出响应超时，可能的原因：1) inject.js未正确加载 2) 数据处理时间过长 3) 网络问题',
            data: []
          });
        }
      }, 15000); // 增加到15秒超时
    });
  }

  // 获取当前已收集数据的辅助函数
  async function getCurrentCollectedDataUsingInject() {
    return new Promise((resolve) => {
      console.log('📊 [ContentScript] 开始获取inject中的数据...');
      
      let resolved = false;
      const resolveOnce = (result) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };
      
      // 设置响应处理器
      window.pendingResponse = resolveOnce;
  
      // 发送数据获取请求
      window.postMessage({
        type: 'KIMI_COLLECT_REQUEST',
        action: 'getCurrentCollectedData'
      }, '*');
  
      // 超时处理，增加超时时间
      setTimeout(() => {
        if (!resolved) {
          console.error('⏰ [ContentScript] 获取已收集数据响应超时');
          window.pendingResponse = null;
          resolveOnce({ 
            success: false, 
            error: '获取已收集数据响应超时',
            data: [],
            questionsCount: 0,
            totalRecords: 0
          });
        }
      }, 10000); // 增加到10秒超时
    });
  }
  
  // 立即尝试初始化
  initialize();
  
  // 页面加载处理
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    setTimeout(initialize, 100);
    setTimeout(initialize, 500);
    setTimeout(initialize, 1000);
  }
  
  // 添加页面变化监听
  const observer = new MutationObserver((mutations) => {
    if (!isReady && initializationAttempts < MAX_INIT_ATTEMPTS) {
      setTimeout(initialize, 500);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && !isReady) {
      setTimeout(initialize, 500);
    }
  });
  
})();