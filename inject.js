// 注入脚本 - Kimi自动模式专用版
(function() {
  'use strict';

  console.log('🔍 Kimi Collector Auto Mode Script 开始加载');
  
  // 全局停止管理器 - 确保所有组件都能感知停止状态
  const GlobalStopManager = {
    isStopped: false,
    stopCallbacks: [],
    
    // 注册停止回调
    registerStopCallback(callback) {
      if (typeof callback === 'function') {
        this.stopCallbacks.push(callback);
      }
    },
    
    // 触发全局停止
    triggerGlobalStop() {
      console.log('🚨 触发全局停止信号');
      this.isStopped = true;
      
      // 调用所有注册的停止回调
      this.stopCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('停止回调执行失败:', error);
        }
      });
      
      console.log(`✅ 全局停止完成，执行了 ${this.stopCallbacks.length} 个停止回调`);
    },
    
    // 重置停止状态
    reset() {
      console.log('🔄 重置全局停止状态');
      this.isStopped = false;
      this.stopCallbacks = [];
    },
    
    // 检查是否已停止
    checkStopped() {
      return this.isStopped;
    }
  };

  // 🔥 将 simulateTyping 函数移到这里，在 AutoQuestionManager 之前定义
  // 模拟打字输入（备用方案）
  async function simulateTyping(element, text) {
    console.log('⌨️ 开始模拟打字输入...');
    
    element.focus();
    
    // 清空内容
    element.innerHTML = '<p><br></p>';
    
    // 逐字符输入
    for (let i = 0; i < text.length; i++) {
      if (GlobalStopManager.checkStopped()) {
        console.log('🛑 打字过程中检测到停止信号');
        break;
      }
      
      const char = text[i];
      
      // 创建输入事件
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: char,
        inputType: 'insertText'
      });
      
      // 更新内容
      const currentText = element.textContent || '';
      element.innerHTML = `<p>${currentText + char}</p>`;
      
      // 触发事件
      element.dispatchEvent(inputEvent);
      
      // 短暂延迟模拟真实打字
      if (i < text.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.log('✅ 模拟打字完成');
  }

  // 统一的数据收集器 - 适配Kimi
  const UnifiedDataCollector = {
    // 完整收集当前问答数据
    async collectCurrentQA(question, options = {}) {
      console.log('📋 开始统一收集当前问答数据...');
      
      try {
        // 检查全局停止状态
        if (GlobalStopManager.checkStopped()) {
          console.log('🛑 收集器检测到全局停止信号，终止收集');
          throw new Error('用户停止了收集');
        }
        
        // 查找AI回答元素 - Kimi专用选择器
        const aiAnswers = document.querySelectorAll('.segment-assistant');
        if (aiAnswers.length === 0) {
          throw new Error('未找到AI回答元素');
        }
        
        const lastAiElement = aiAnswers[aiAnswers.length - 1];
        
        // 提取回答内容 - Kimi专用
        let answer = '';
        const markdownElement = lastAiElement.querySelector('.markdown-container .markdown');
        if (markdownElement) {
          answer = markdownElement.textContent.trim();
        } else {
          // 备用方案
          answer = lastAiElement.textContent.trim();
        }
        
        console.log(`📝 提取到回答内容: ${answer.substring(0, 100)}...`);
        
        // 再次检查停止状态
        if (GlobalStopManager.checkStopped()) {
          console.log('🛑 在提取回答后检测到停止信号');
          throw new Error('用户停止了收集');
        }
        
        // 检查是否有搜索结果 - Kimi专用
        const hasSearch = this.checkForSearch(lastAiElement);
        console.log(`🔍 是否包含搜索结果: ${hasSearch}`);
        
        if (hasSearch) {
          console.log('🔍 检测到搜索结果，开始收集流程...');
          
          // 🔥 删除点击操作，直接等待搜索结果加载
          console.log('⏳ 等待搜索结果自动加载...');
          await this.delay(3000); // 等待搜索结果完全显示
          
          // 检查停止状态
          if (GlobalStopManager.checkStopped()) {
            console.log('🛑 在等待搜索结果后检测到停止信号');
            throw new Error('用户停止了收集');
          }
          
          // 直接提取搜索结果（无需点击展开）
          console.log('📦 直接提取搜索结果和URL...');
          const searchResults = await this.extractSearchResultsDirectly(options.progressCallback);
          console.log(`✅ 获得 ${searchResults.length} 个完整搜索结果`);
          
          // 收集文件名
          console.log('📄 收集对话标题...');
          const fileName = this.extractFileName();
          console.log(`✅ 获得文件名: ${fileName}`);
          
          const results = [];
          
          if (searchResults.length > 0) {
            // 为每个搜索结果创建一行完整数据
            searchResults.forEach((source, sourceIndex) => {
              results.push({
                问题: question,
                AI输出的答案: answer,
                文件名: fileName,
                序号: source.index || (sourceIndex + 1),
                标题: source.title || '无标题',
                内容: source.content || '无内容',
                网站: source.site || '',
                网站url: source.url || '',
                文章引用时间: source.time || ''
              });
            });
            
            console.log(`✅ 完整收集完成: 生成 ${results.length} 条完整记录`);
          } else {
            // 没有搜索结果，但有搜索指示
            results.push({
              问题: question,
              AI输出的答案: answer,
              文件名: fileName,
              序号: '',
              标题: '',
              内容: '',
              网站: '',
              网站url: '',
              文章引用时间: ''
            });
            
            console.log('✅ 收集完成: 生成 1 条基础记录（无搜索结果）');
          }
          
          return results;
        } else {
          // 没有搜索结果的问答，先等待5秒确保对话标题生成完毕
          await this.delay(5000);
          console.log('🔍 无搜索结果，收集基础问答数据...');
          const fileName = this.extractFileName();
          
          const result = [{
            问题: question,
            AI输出的答案: answer,
            文件名: fileName,
            序号: '',
            标题: '',
            内容: '',
            网站: '',
            网站url: '',
            文章引用时间: ''
          }];
          
          console.log('✅ 基础问答数据收集完成');
          return result;
        }
        
      } catch (error) {
        console.error('💥 统一收集问答数据失败:', error);
        throw error;
      }
    },

    // 检查AI回答是否有搜索结果 - Kimi专用
    checkForSearch(aiElement) {
      // 方法1：检查是否存在.sites容器
      const sitesContainer = aiElement.querySelector('.sites');
      if (sitesContainer) {
        console.log('✅ 检测到搜索结果容器 .sites');
        return true;
      }
      
      // 方法2：检查搜索提示文本
      const searchElements = aiElement.querySelectorAll('.search-plus .search-plus-tips');
      for (const searchElement of searchElements) {
        const text = searchElement.textContent.trim();
        if (text.includes('搜索') || text.includes('来源') || text.includes('参考')) {
          console.log(`✅ 检测到搜索标识: ${text}`);
          return true;
        }
      }
      
      // 方法3：检查是否存在.search-plus元素
      const searchPlusElement = aiElement.querySelector('.search-plus');
      if (searchPlusElement) {
        console.log('✅ 检测到搜索区域');
        return true;
      }
      
      // 方法4：检查是否存在搜索结果链接
      const searchLinks = aiElement.querySelectorAll('a.site');
      if (searchLinks.length > 0) {
        console.log(`✅ 检测到 ${searchLinks.length} 个搜索结果链接`);
        return true;
      }
      
      return false;
    },

    // 直接提取搜索结果 - Kimi简化版（无需复杂的URL拦截）
    async extractSearchResultsDirectly(progressCallback = null) {
      const results = [];
      
      console.log('🔍 开始直接提取搜索结果（无需点击）...');
      
      // 等待搜索结果完全加载
      let attempts = 0;
      const maxAttempts = 10;
      let searchContainer = null;
      
      // 循环检查搜索结果是否加载完成
      while (attempts < maxAttempts && !searchContainer) {
        searchContainer = document.querySelector('.sites');
        
        if (!searchContainer) {
          console.log(`⏳ 等待搜索结果加载... (尝试 ${attempts + 1}/${maxAttempts})`);
          await this.delay(1000);
          attempts++;
        } else {
          console.log('✅ 搜索结果容器已找到');
          break;
        }
      }
      
      if (!searchContainer) {
        console.log('❌ 未找到搜索结果容器 .sites');
        return results;
      }
      
      // 再等待一下确保内容完全加载
      await this.delay(1000);
      
      const searchElements = searchContainer.querySelectorAll('a.site');
      console.log(`📦 找到 ${searchElements.length} 个搜索结果项`);
      
      if (searchElements.length === 0) {
        return results;
      }
      
      // 发送进度更新
      if (progressCallback) {
        progressCallback({
          current: 0,
          total: searchElements.length,
          message: '开始提取搜索结果...'
        });
      }
      
      try {
        // 直接遍历提取，无需复杂的点击和拦截逻辑
        searchElements.forEach((searchElement, index) => {
          console.log(`📦 处理第 ${index + 1}/${searchElements.length} 个搜索结果`);
          
          // 检查停止状态
          if (GlobalStopManager.checkStopped()) {
            console.log('🛑 提取过程中检测到停止信号');
            return;
          }
          
          const result = {
            index: index + 1,
            title: this.extractSearchTitle(searchElement),
            url: searchElement.href || '', // Kimi的优势：直接获取URL
            content: this.extractSearchSnippet(searchElement),
            site: this.extractSearchSite(searchElement), 
            time: this.extractSearchTime(searchElement)
          };
          
          results.push(result);
          
          console.log(`✅ 第 ${index + 1} 个结果: ${result.title} - ${result.url}`);
          
          // 发送进度更新
          if (progressCallback) {
            progressCallback({
              current: index + 1,
              total: searchElements.length,
              message: `已处理 ${index + 1}/${searchElements.length} 个结果`
            });
          }
        });
        
        console.log(`🎉 搜索结果提取完成，共 ${results.length} 个结果`);
        
      } catch (error) {
        console.error('💥 提取搜索结果失败:', error);
      }
      
      return results;
    },

    // 提取搜索结果的各个字段 - Kimi专用
    extractSearchTitle(element) {
      const titleElement = element.querySelector('.title');
      return titleElement ? titleElement.textContent.trim() : '';
    },
    
    extractSearchSnippet(element) {
      const snippetElement = element.querySelector('.snippet');
      let content = snippetElement ? snippetElement.textContent.trim() : '';
      
      // 限制内容长度
      if (content.length > 200) {
        content = content.substring(0, 200) + '...';
      }
      
      return content;
    },
    
    extractSearchSite(element) {
      const siteElement = element.querySelector('.name');
      return siteElement ? siteElement.textContent.trim() : '';
    },
    
    extractSearchTime(element) {
      const timeElement = element.querySelector('.date');
      return timeElement ? timeElement.textContent.trim() : '';
    },

    // 提取对话标题 - 从侧边栏历史会话获取
    extractFileName() {
      console.log('📄 开始从侧边栏提取对话标题...');
      
      // 基于用户提供的侧边栏DOM结构的选择器
      const sidebarSelectors = [
        '.sidebar-nav .history-part ul li:first-child a',        // 主要选择器：第一个历史会话
        '.history-part ul li:first-child a.chat-info-item',      // 带class的选择器
        '.sidebar-nav .history-part ul li:first-child',          // 直接获取li内容
        '.history-part ul li:first-child',                       // 简化选择器
        '.sidebar-nav ul li:first-child a',                      // 更通用的选择器
        '.chat-info-item:first-of-type'                          // 基于class的选择器
      ];
      
      for (const selector of sidebarSelectors) {
        try {
          const element = document.querySelector(selector);
          if (element && element.textContent && element.textContent.trim()) {
            const fileName = element.textContent.trim();
            console.log(`✅ 通过侧边栏选择器 "${selector}" 找到文件名: "${fileName}"`);
            return fileName;
          }
        } catch (error) {
          console.warn(`侧边栏选择器 "${selector}" 查找失败:`, error);
          continue;
        }
      }
      
      // 如果侧边栏方法失败，尝试备用方法
      console.log('⚠️ 侧边栏方法失败，尝试备用方法...');
      
      // 备用方法1：查找所有的 chat-info-item
      try {
        const chatItems = document.querySelectorAll('.chat-info-item');
        if (chatItems.length > 0) {
          const fileName = chatItems[0].textContent.trim();
          if (fileName) {
            console.log(`✅ 通过chat-info-item找到文件名: "${fileName}"`);
            return fileName;
          }
        }
      } catch (error) {
        console.warn('chat-info-item方法失败:', error);
      }
      
      // 备用方法2：尝试从URL路径获取会话信息
      try {
        const urlPath = window.location.pathname;
        if (urlPath.includes('/chat/') && urlPath !== '/chat' && urlPath !== '/') {
          console.log('⚠️ 从URL检测到是具体会话，但无法从侧边栏获取标题');
          // 可以考虑延迟重试，因为侧边栏可能还在加载
          return this.extractFileNameWithRetry();
        }
      } catch (error) {
        console.warn('URL分析失败:', error);
      }
      
      // 备用方法3：从页面标题获取（但可能不准确）
      if (document.title && document.title !== 'Kimi' && !document.title.includes('Kimi')) {
        const titleFileName = document.title.trim();
        console.log(`⚠️ 从页面标题获取文件名（可能不准确）: "${titleFileName}"`);
        return titleFileName;
      }
      
      console.log('❌ 无法找到有效的对话标题，使用默认名称');
      return '未命名对话';
    },
    
    // 延迟重试获取文件名（给侧边栏更多加载时间）
    async extractFileNameWithRetry(maxRetries = 3, delay = 2000) {
      console.log('📄 延迟重试获取文件名...');
      
      for (let i = 0; i < maxRetries; i++) {
        console.log(`📄 重试获取文件名 (${i + 1}/${maxRetries})`);
        
        // 等待侧边栏加载
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // 再次尝试从侧边栏获取
        const sidebarSelectors = [
          '.sidebar-nav .history-part ul li:first-child a',
          '.history-part ul li:first-child a.chat-info-item',
          '.chat-info-item:first-of-type'
        ];
        
        for (const selector of sidebarSelectors) {
          try {
            const element = document.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
              const fileName = element.textContent.trim();
              console.log(`✅ 重试成功，通过选择器 "${selector}" 找到文件名: "${fileName}"`);
              return fileName;
            }
          } catch (error) {
            continue;
          }
        }
      }
      
      console.log('❌ 重试失败，使用默认名称');
      return '未命名对话';
    },

    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  };

  // 改进的输入设置函数 - 适配Kimi的contenteditable
  function setNativeValue(element, value) {
    console.log(`🎯 使用原生方式设置输入值: "${value}"`);
    
    try {
      // 检测Lexical编辑器
      if (element.contentEditable === 'true' && element.hasAttribute('data-lexical-editor')) {
        console.log('✅ 检测到Lexical编辑器，使用专用方法设置');
        
        // 方法1：使用Lexical编辑器的专用方法
        return setLexicalEditorValue(element, value);
        
      } else if (element.contentEditable === 'true') {
        console.log('✅ 检测到普通contenteditable元素');
        
        // 方法2：普通contenteditable处理
        return setContentEditableValue(element, value);
        
      } else {
        // 方法3：传统input/textarea处理
        return setTraditionalInputValue(element, value);
      }
      
    } catch (error) {
      console.error('💥 设置输入值失败:', error);
      return false;
    }
  }

  // 专门处理Lexical编辑器的函数
  function setLexicalEditorValue(element, value) {
    try {
      console.log('🔧 使用Lexical编辑器专用方法...');
      
      // 步骤1：聚焦并确保编辑器活跃
      element.focus();
      
      // 步骤2：全选现有内容
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // 步骤3：等待一下确保选中
      setTimeout(() => {
        // 步骤4：使用execCommand替换选中内容（Lexical编辑器通常支持）
        if (document.execCommand) {
          try {
            const replaced = document.execCommand('insertText', false, value);
            if (replaced) {
              console.log('✅ 通过execCommand成功设置内容');
              triggerLexicalEvents(element);
              return true;
            }
          } catch (execError) {
            console.warn('execCommand失败，尝试其他方法:', execError);
          }
        }
        
        // 步骤5：备选方案 - 直接操作DOM
        setLexicalDOMDirectly(element, value);
        
      }, 100);
      
      // 步骤6：触发Lexical编辑器事件
      setTimeout(() => {
        triggerLexicalEvents(element);
      }, 200);
      
      return true;
      
    } catch (error) {
      console.error('💥 Lexical编辑器处理失败:', error);
      // 降级到普通contenteditable处理
      return setContentEditableValue(element, value);
    }
  }

  // 直接操作Lexical编辑器DOM
  function setLexicalDOMDirectly(element, value) {
    try {
      console.log('🔧 直接操作Lexical编辑器DOM...');
      
      // 清空现有内容
      element.innerHTML = '';
      
      // 创建段落元素
      const paragraph = document.createElement('p');
      paragraph.textContent = value;
      
      // 插入内容
      element.appendChild(paragraph);
      
      // 设置光标到末尾
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(paragraph, paragraph.childNodes.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      
      console.log('✅ DOM直接操作完成');
      return true;
      
    } catch (error) {
      console.error('💥 DOM直接操作失败:', error);
      return false;
    }
  }

  // 触发Lexical编辑器相关事件
  function triggerLexicalEvents(element) {
    console.log('🎯 触发Lexical编辑器事件...');
    
    const events = [
      // 基础事件
      new Event('input', { bubbles: true, cancelable: true }),
      new Event('change', { bubbles: true, cancelable: true }),
      
      // 键盘事件
      new KeyboardEvent('keydown', { 
        bubbles: true, 
        cancelable: true, 
        key: 'Enter',
        code: 'Enter',
        keyCode: 13
      }),
      new KeyboardEvent('keyup', { 
        bubbles: true, 
        cancelable: true, 
        key: 'Enter',
        code: 'Enter',
        keyCode: 13
      }),
      
      // 鼠标事件
      new MouseEvent('click', { bubbles: true, cancelable: true }),
      
      // 焦点事件
      new FocusEvent('focus', { bubbles: true, cancelable: true }),
      new FocusEvent('focusin', { bubbles: true, cancelable: true }),
      
      // 组合事件
      new CompositionEvent('compositionstart', { bubbles: true, cancelable: true }),
      new CompositionEvent('compositionend', { bubbles: true, cancelable: true })
    ];
    
    events.forEach((event, index) => {
      try {
        setTimeout(() => {
          element.dispatchEvent(event);
        }, index * 50); // 错开事件触发时间
      } catch (e) {
        console.warn(`触发事件失败 ${event.type}:`, e);
      }
    });
    
    console.log('✅ 事件触发完成');
  }

  // 处理普通contenteditable元素
  function setContentEditableValue(element, value) {
    try {
      console.log('🔧 处理普通contenteditable元素...');
      
      // 聚焦元素
      element.focus();
      
      // 清空内容
      element.innerHTML = '';
      
      // 设置文本内容
      element.innerHTML = `<p>${value}</p>`;
      element.textContent = value;
      
      // 设置光标位置到末尾
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // 触发事件
      const events = [
        new Event('input', { bubbles: true, cancelable: true }),
        new Event('change', { bubbles: true, cancelable: true })
      ];
      
      events.forEach(event => {
        try {
          element.dispatchEvent(event);
        } catch (e) {
          console.warn('触发事件失败:', e);
        }
      });
      
      console.log('✅ 普通contenteditable处理完成');
      return true;
      
    } catch (error) {
      console.error('💥 普通contenteditable处理失败:', error);
      return false;
    }
  }

  // 处理传统input/textarea元素
  function setTraditionalInputValue(element, value) {
    try {
      console.log('🔧 处理传统input/textarea元素...');
      
      const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      
      if (prototypeValueSetter && prototypeValueSetter !== valueSetter) {
        prototypeValueSetter.call(element, value);
      } else if (valueSetter) {
        valueSetter.call(element, value);
      } else {
        element.value = value;
      }
      
      // 触发事件
      const events = [
        new Event('input', { bubbles: true, cancelable: true }),
        new Event('change', { bubbles: true, cancelable: true })
      ];
      
      events.forEach(event => {
        try {
          element.dispatchEvent(event);
        } catch (e) {
          console.warn('触发事件失败:', e);
        }
      });
      
      console.log('✅ 传统input处理完成');
      return true;
      
    } catch (error) {
      console.error('💥 传统input处理失败:', error);
      return false;
    }
  }

  // 数据收集器 - 支持自动模式和手动导出
  const DataCollectionManager = {
    collectedData: [],
    
    // 添加收集的数据
    addData(data) {
      if (data && Array.isArray(data)) {
        this.collectedData.push(...data);
      }
    },
    
    // 获取收集的数据
    getData() {
      return [...this.collectedData];
    },
    
    // 清空数据
    clear() {
      this.collectedData = [];
    },
    
    // 完成收集并导出
    finishAndExport() {
      if (this.collectedData.length === 0) {
        return { success: false, error: '没有收集到任何数据' };
      }
      
      console.log(`🎉 完成收集，共收集 ${this.collectedData.length} 行数据`);
      
      const result = {
        success: true,
        data: [...this.collectedData]
      };
      
      return result;
    },

    // 添加数据验证方法
    validateData() {
      const issues = [];
      
      if (this.collectedData.length === 0) {
        issues.push('没有收集到任何数据');
        return { valid: false, issues };
      }
      
      // 检查数据完整性
      const requiredFields = ['问题', 'AI输出的答案', '文件名'];
      this.collectedData.forEach((item, index) => {
        requiredFields.forEach(field => {
          if (!item[field] || item[field].trim() === '') {
            issues.push(`第${index + 1}条记录缺少${field}`);
          }
        });
      });
      
      return {
        valid: issues.length === 0,
        issues: issues,
        dataCount: this.collectedData.length
      };
    },
    
    // 获取收集状态
    getStatus() {
      const questionsCount = new Set(this.collectedData.map(item => item.问题)).size;
      return {
        active: false,
        collected: this.collectedData.length,
        questionsCount: questionsCount,
        data: [...this.collectedData]
      };
    }
  };

  // 自动问答管理器 - 适配Kimi
  const AutoQuestionManager = {
    isActive: false,
    questionQueue: [],
    currentQuestionIndex: 0,
    collectedData: [],
    currentTaskId: null,
    statusCallback: null,
    
    // 开始自动问答流程
    async start(taskId, questions, statusCallback) {
      if (this.isActive) {
        throw new Error('自动问答正在进行中');
      }
      
      // 重置全局停止状态
      GlobalStopManager.reset();
      
      this.isActive = true;
      this.currentTaskId = taskId;
      this.questionQueue = [...questions];
      this.currentQuestionIndex = 0;
      this.collectedData = [];
      this.statusCallback = statusCallback;
      
      console.log(`🚀 开始自动问答，共 ${questions.length} 个问题`);
      
      // 注册停止回调
      GlobalStopManager.registerStopCallback(() => {
        console.log('🛑 自动问答管理器收到全局停止信号');
        this.isActive = false;
      });
      
      try {
        await this.processAllQuestions();
        
        if (!GlobalStopManager.checkStopped()) {
          console.log('🎉 所有问题处理完成');
          return {
            success: true,
            data: this.collectedData,
            message: `成功处理 ${this.questionQueue.length} 个问题`
          };
        } else {
          console.log('🛑 自动问答被用户停止');
          return {
            success: false,
            data: this.collectedData,
            message: '用户停止了自动问答'
          };
        }
      } catch (error) {
        console.error('💥 自动问答过程中出错:', error);
        throw error;
      } finally {
        this.cleanup();
      }
    },
    
    // 停止逻辑
    stop() {
      console.log('🛑 [AutoQuestionManager] 收到停止信号');
      console.log(`🛑 [AutoQuestionManager] 停止前数据状态: ${this.collectedData.length} 条记录`);
      
      // 触发全局停止，确保所有组件都能感知
      GlobalStopManager.triggerGlobalStop();
      
      // 延迟清理资源，给外部组件时间获取数据
      setTimeout(() => {
        console.log('🧹 [AutoQuestionManager] 延迟清理资源...');
        this.cleanup();
      }, 2000);
      
      console.log('✅ [AutoQuestionManager] 停止信号处理完成');
      
      return {
        success: true,
        message: '自动问答已停止',
        collectedData: [...this.collectedData]
      };
    },

    // 获取发送按钮状态 - Kimi专用
    getSendButtonState() {
      const sendButtonContainer = document.querySelector('.send-button-container');
      if (!sendButtonContainer) {
        return 'unknown';
      }
      
      const classes = sendButtonContainer.className;
      console.log(`🎯 发送按钮类名: ${classes}`);
      
      // Kimi的状态判断逻辑
      if (classes.includes('disabled') && classes.includes('stop')) {
        console.log('🛑 检测到停止状态，AI正在生成...');
        return 'generating'; // 正在生成（有停止按钮）
      } else if (classes.includes('disabled') && !classes.includes('stop')) {
        console.log('⏳ 按钮被禁用，等待状态或完成状态...');
        return 'waiting'; // 等待状态或完成状态
      } else if (!classes.includes('disabled')) {
        console.log('✅ 按钮可用，可以发送问题...');
        return 'ready'; // 可以发送问题
      }
      
      return 'unknown';
    },
    
    // 获取当前已收集的数据
    getCurrentCollectedData() {
      console.log(`📊 [AutoQuestionManager] 获取当前已收集数据...`);
      console.log(`📊 [AutoQuestionManager] 当前状态: isActive=${this.isActive}, collectedData.length=${this.collectedData.length}`);
      
      try {
        const data = [...this.collectedData];
        const questionsCount = new Set(data.map(item => item.问题)).size;
        
        console.log(`📊 [AutoQuestionManager] 数据统计: ${data.length} 条记录, ${questionsCount} 个问题`);
        
        return {
          success: true,
          data: data,
          questionsCount: questionsCount,
          totalRecords: data.length
        };
        
      } catch (error) {
        console.error('💥 [AutoQuestionManager] 获取数据失败:', error);
        return {
          success: false,
          error: error.message,
          data: [],
          questionsCount: 0,
          totalRecords: 0
        };
      }
    },

    // 核心：完善的问题处理流程
    async processAllQuestions() {
      for (let i = 0; i < this.questionQueue.length; i++) {
        // 每个步骤都检查全局停止状态
        if (GlobalStopManager.checkStopped()) {
          console.log(`🛑 自动问答被停止，已处理 ${i}/${this.questionQueue.length} 个问题`);
          break;
        }
        
        this.currentQuestionIndex = i;
        const question = this.questionQueue[i];
        
        console.log(`\n🔢 === 开始处理第 ${i + 1}/${this.questionQueue.length} 个问题 ===`);
        console.log(`❓ 问题内容: ${question}`);
        
        // 更新状态
        if (this.statusCallback) {
          this.statusCallback({
            current: i + 1,
            total: this.questionQueue.length,
            message: `正在处理第 ${i + 1} 个问题...`,
            question: question
          });
        }
        
        try {
          // 再次检查停止状态
          if (GlobalStopManager.checkStopped()) {
            console.log(`🛑 在发送问题前检测到停止信号`);
            break;
          }
          
          // 步骤1: 发送问题到Kimi
          console.log(`📤 步骤1/4: 发送问题 ${i + 1}`);
          if (this.statusCallback) {
            this.statusCallback({
              current: i + 1,
              total: this.questionQueue.length,
              message: `步骤1/4: 正在发送问题...`,
              question: question
            });
          }
          
          await this.sendQuestionByEnter(question);
          console.log(`✅ 步骤1完成: 问题已发送`);
          
          // 再次检查停止状态
          if (GlobalStopManager.checkStopped()) {
            console.log(`🛑 在等待AI回答前检测到停止信号`);
            break;
          }
          
          // 步骤2: 等待AI回答完成并收集数据
          console.log(`📄 步骤2/4: 等待AI回答完成并收集数据`);
          if (this.statusCallback) {
            this.statusCallback({
              current: i + 1,
              total: this.questionQueue.length,
              message: `步骤2/4: 等待AI回答并收集数据...`,
              question: question
            });
          }
          
          // 使用完善的等待和收集逻辑
          const collectionResult = await this.waitForAIResponseAndCollect(question);
          
          // 再次检查停止状态
          if (GlobalStopManager.checkStopped()) {
            console.log(`🛑 在处理收集结果前检测到停止信号`);
            break;
          }
          
          console.log(`✅ 步骤2完成: 等待和收集完毕，获得 ${collectionResult.length} 条记录`);
          
          // 步骤3: 保存收集的数据
          console.log(`💾 步骤3/4: 保存收集数据`);
          if (collectionResult && collectionResult.length > 0) {
            this.collectedData.push(...collectionResult);
            console.log(`✅ 步骤3完成: 数据已保存，累计 ${this.collectedData.length} 条记录`);
            
            // 发送数据更新到popup界面
            if (this.statusCallback) {
              window.postMessage({
                type: 'AUTO_QUESTION_DATA_UPDATE',
                collectedCount: this.collectedData.length
              }, '*');
            }
          } else {
            console.log(`⚠️ 步骤3: 本次没有收集到数据`);
          }
          
          // 再次检查停止状态
          if (GlobalStopManager.checkStopped()) {
            console.log(`🛑 在开启新对话前检测到停止信号`);
            break;
          }
          
          // 步骤4: 如果不是最后一个问题，开启新对话
          if (i < this.questionQueue.length - 1 && !GlobalStopManager.checkStopped()) {
            console.log(`📄 步骤4/4: 为下一个问题开启新对话`);
            if (this.statusCallback) {
              this.statusCallback({
                current: i + 1,
                total: this.questionQueue.length,
                message: `步骤4/4: 开启新对话...`,
                question: question
              });
            }
            
            await this.startNewConversation();
            console.log(`✅ 步骤4完成: 新对话已开启，准备处理第 ${i + 2} 个问题`);
          } else if (i === this.questionQueue.length - 1) {
            console.log(`🎯 这是最后一个问题，不需开启新对话`);
          }
          
          // 完成状态更新
          if (this.statusCallback && !GlobalStopManager.checkStopped()) {
            this.statusCallback({
              current: i + 1,
              total: this.questionQueue.length,
              message: `✅ 第 ${i + 1} 个问题完成 (累计${this.collectedData.length}条数据)`,
              question: question
            });
          }
          
          console.log(`🎉 第 ${i + 1}/${this.questionQueue.length} 个问题完整处理流程结束`);
          console.log(`📊 当前累计数据: ${this.collectedData.length} 条记录`);
          
        } catch (error) {
          console.error(`💥 处理第 ${i + 1} 个问题失败:`, error);
          
          // 检查是否是用户停止引起的错误
          if (GlobalStopManager.checkStopped()) {
            console.log(`🛑 由于用户停止导致的错误，终止处理`);
            break;
          }
          
          // 记录错误但继续处理下一个问题
          this.collectedData.push({
            问题: question,
            AI输出的答案: `处理失败: ${error.message}`,
            文件名: UnifiedDataCollector.extractFileName(),
            序号: '',
            标题: '',
            内容: '',
            网站: '',
            网站url: '',
            文章引用时间: ''
          });
          
          // 即使出错，也要为下一个问题开启新对话
          if (i < this.questionQueue.length - 1 && !GlobalStopManager.checkStopped()) {
            try {
              console.log(`📄 错误恢复: 为下一个问题开启新对话`);
              await this.startNewConversation();
              console.log(`✅ 错误恢复: 新对话已开启`);
            } catch (newChatError) {
              console.error('💥 开启新对话失败:', newChatError);
              if (i < this.questionQueue.length - 2) {
                console.error('🚨 无法继续后续问题，因为新对话开启失败');
                break;
              }
            }
          }
        }
        
        // 最终检查：短暂休息前检查停止状态
        if (i < this.questionQueue.length - 1 && !GlobalStopManager.checkStopped()) {
          console.log(`😴 问题 ${i + 1} 处理完毕，休息 1 秒后继续...`);
          
          // 分段等待，每200ms检查一次停止状态
          for (let wait = 0; wait < 1000; wait += 200) {
            if (GlobalStopManager.checkStopped()) {
              console.log(`🛑 在休息期间检测到停止信号`);
              return;
            }
            await this.delay(200);
          }
        }
      }
      
      // 最终检查停止状态
      if (GlobalStopManager.checkStopped()) {
        console.log(`🛑 自动问答流程被用户停止`);
      } else {
        console.log(`🎉 自动问答流程正常完成`);
      }
    },
    
    // 等待AI回答完成并收集数据 - Kimi专用
    async waitForAIResponseAndCollect(question) {
      console.log('📄 开始等待AI回答并收集数据...');
      
      return new Promise((resolve, reject) => {
        let collectionCompleted = false;
        let collectionResult = [];
        let checkInterval = null;
        let observer = null;
        
        // 定期检查停止状态的定时器
        const stopCheckInterval = setInterval(() => {
          if (GlobalStopManager.checkStopped() && !collectionCompleted) {
            console.log('🛑 等待AI回答过程中检测到停止信号');
            collectionCompleted = true;
            
            // 清理所有资源
            if (stopCheckInterval) clearInterval(stopCheckInterval);
            if (checkInterval) clearInterval(checkInterval);
            if (observer) observer.disconnect();
            
            // 返回已收集的数据（如果有的话）
            resolve(collectionResult);
          }
        }, 300);
        
        // 状态检查器
        let lastSendButtonState = null;
        
        const checkAIStatus = async () => {
          try {
            // 在检查状态前先检查停止信号
            if (GlobalStopManager.checkStopped()) {
              console.log('🛑 在AI状态检查时发现停止信号');
              return;
            }
            
            const currentState = this.getSendButtonState();
            
            // 关键逻辑：检测状态变化从"正在生成"变为"等待状态"（完成）
            if (lastSendButtonState === 'generating' && (currentState === 'waiting' || currentState === 'ready')) {
              console.log('🎯 检测到AI生成完成，开始收集数据...');
              
              // 立即开始收集，不再等待延迟
              if (!collectionCompleted && !GlobalStopManager.checkStopped()) {
                collectionCompleted = true;
                
                // 清理定时器和监听器
                if (stopCheckInterval) clearInterval(stopCheckInterval);
                if (checkInterval) clearInterval(checkInterval);
                if (observer) observer.disconnect();
                
                try {
                  console.log('📋 使用统一收集器收集当前问答数据...');
                  
                  // 等待3秒确保内容完全渲染
                  await new Promise(resolve => setTimeout(resolve, 3000));
                  
                  // 再次检查停止状态
                  if (GlobalStopManager.checkStopped()) {
                    console.log('🛑 在收集延迟后发现停止信号');
                    resolve(collectionResult);
                    return;
                  }
                  
                  const qaData = await UnifiedDataCollector.collectCurrentQA(question, {
                    progressCallback: (progress) => {
                      console.log(`🔗 URL提取进度: ${progress.current}/${progress.total}`);
                    }
                  });
                  
                  console.log(`✅ AI回答收集完成，获得 ${qaData.length} 条记录`);
                  collectionResult = qaData || [];
                  resolve(collectionResult);
                  
                } catch (collectionError) {
                  console.error('💥 AI回答收集失败:', collectionError);
                  
                  // 返回基础错误记录
                  const errorResult = [{
                    问题: question,
                    AI输出的答案: `收集失败: ${collectionError.message}`,
                    文件名: UnifiedDataCollector.extractFileName(),
                    序号: '',
                    标题: '',
                    内容: '',
                    网站: '',
                    网站url: '',
                    文章引用时间: ''
                  }];
                  
                  resolve(errorResult);
                }
              }
            }
            
            lastSendButtonState = currentState;
            
          } catch (error) {
            console.error('检查AI状态失败:', error);
          }
        };
        
        // 绑定this上下文
        const boundCheckAIStatus = checkAIStatus.bind(this);
        
        // 立即检查状态
        boundCheckAIStatus();
        
        // 启动定期状态检查（每500ms检查一次）
        checkInterval = setInterval(() => {
          if (!collectionCompleted && !GlobalStopManager.checkStopped()) {
            boundCheckAIStatus();
          }
        }, 500);
        
        // 启动页面变化监听
        observer = new MutationObserver(() => {
          if (!collectionCompleted && !GlobalStopManager.checkStopped()) {
            boundCheckAIStatus();
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class']
        });
        
        console.log('📡 AI回答等待监控已启动');
        
        // 设置超时保护（最多等待3分钟）
        setTimeout(() => {
          if (!collectionCompleted) {
            console.log('⏰ 等待AI回答超时，强制完成');
            collectionCompleted = true;
            
            // 清理资源
            if (stopCheckInterval) clearInterval(stopCheckInterval);
            if (checkInterval) clearInterval(checkInterval);
            if (observer) observer.disconnect();
            
            // 超时时尝试最后一次收集（如果没有被停止）
            if (!GlobalStopManager.checkStopped()) {
              UnifiedDataCollector.collectCurrentQA(question).then(qaData => {
                resolve(qaData || []);
              }).catch(error => {
                console.error('超时收集失败:', error);
                resolve([{
                  问题: question,
                  AI输出的答案: `收集超时: ${error.message}`,
                  文件名: UnifiedDataCollector.extractFileName(),
                  序号: '',
                  标题: '',
                  内容: '',
                  网站: '',
                  网站url: '',
                  文章引用时间: ''
                }]);
              });
            } else {
              resolve(collectionResult);
            }
          }
        }, 180000); // 3分钟超时
      });
    },
    
    // 开启新对话 - Kimi专用
    async startNewConversation() {
      console.log('📄 开启新对话...');
      
      try {
        // 检查停止状态
        if (GlobalStopManager.checkStopped()) {
          console.log(`🛑 在新建会话前检测到停止信号`);
          return;
        }
        
        // 确保页面获得焦点
        window.focus();
        await this.delay(200);
        
        // 主方案：使用 Ctrl+K 快捷键
        console.log('⌨️ 尝试 Ctrl+K 快捷键...');
        const success1 = await this.tryCtrlKShortcut();
        
        if (success1) {
          console.log('✅ Ctrl+K 快捷键成功');
          return;
        }
        
        // 备用方案1：点击侧边栏新建会话按钮
        console.log('📄 Ctrl+K 失效，尝试点击新建会话按钮...');
        const success2 = await this.tryClickNewChatButton();
        
        if (success2) {
          console.log('✅ 点击新建会话按钮成功');
          return;
        }
        
        // 如果两种方案都失败
        console.warn('⚠️ 所有新建会话方案都失败了');
        throw new Error('无法开启新会话：Ctrl+K快捷键和新建会话按钮都不可用');
        
      } catch (error) {
        console.error('💥 开启新对话失败:', error);
        throw new Error(`新对话开启失败: ${error.message}`);
      }
    },
    
    // 尝试 Ctrl+K 快捷键
    async tryCtrlKShortcut() {
      try {
        console.log('⌨️ 发送 Ctrl+K 快捷键...');
        
        // 在多个目标上触发快捷键
        const targets = [document, document.body, document.documentElement];
        
        for (const target of targets) {
          // keydown 事件
          const ctrlKEvent = new KeyboardEvent('keydown', {
            key: 'k',
            code: 'KeyK',
            keyCode: 75,
            which: 75,
            ctrlKey: true,
            bubbles: true,
            cancelable: true
          });
          
          target.dispatchEvent(ctrlKEvent);
          
          // keyup 事件
          const ctrlKUpEvent = new KeyboardEvent('keyup', {
            key: 'k',
            code: 'KeyK', 
            keyCode: 75,
            which: 75,
            ctrlKey: true,
            bubbles: true,
            cancelable: true
          });
          
          target.dispatchEvent(ctrlKUpEvent);
        }
        
        console.log('✅ Ctrl+K 快捷键已发送');
        
        // 等待页面响应
        await this.delay(1500);
        
        // 验证是否成功
        return this.verifyNewConversationStarted();
        
      } catch (error) {
        console.error('Ctrl+K 快捷键失败:', error);
        return false;
      }
    },
    
    // 尝试点击新建会话按钮
    async tryClickNewChatButton() {
      console.log('🖱️ 尝试点击新建会话按钮...');
      
      try {
        // 基于用户提供的DOM结构的选择器
        const newChatButtonSelectors = [
          '.sidebar-nav .new-chat-btn',        // 主要选择器
          '.sidebar-nav a[href="/"]',          // 基于href的选择器
          'a.new-chat-btn',                    // 通用选择器
          '.new-chat-btn',
          'a[href="/"]'
        ];
        
        let newChatButton = null;
        for (const selector of newChatButtonSelectors) {
          newChatButton = document.querySelector(selector);
          if (newChatButton) {
            console.log(`✅ 找到新建会话按钮: ${selector}`);
            break;
          }
        }
        
        if (!newChatButton) {
          console.log('❌ 未找到新建会话按钮');
          return false;
        }
        
        // 如果按钮不可见，尝试显示侧边栏
        if (newChatButton.offsetParent === null) {
          console.log('⚠️ 新建会话按钮不可见，尝试显示侧边栏...');
          await this.tryShowSidebar();
          await this.delay(1000);
          
          // 重新检查可见性
          if (newChatButton.offsetParent === null) {
            console.log('⚠️ 按钮仍不可见，但继续尝试点击');
          }
        }
        
        // 检查停止状态
        if (GlobalStopManager.checkStopped()) {
          console.log('🛑 在点击新建会话按钮前检测到停止信号');
          return false;
        }
        
        // 滚动到按钮位置（确保可点击）
        try {
          newChatButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await this.delay(300);
        } catch (scrollError) {
          console.warn('滚动到按钮失败:', scrollError);
        }
        
        // 模拟完整的点击序列
        console.log('🖱️ 执行点击序列...');
        
        const clickEvents = [
          new MouseEvent('mousedown', { 
            bubbles: true, 
            cancelable: true,
            view: window,
            detail: 1,
            button: 0,
            buttons: 1
          }),
          new MouseEvent('mouseup', { 
            bubbles: true, 
            cancelable: true,
            view: window,
            detail: 1,
            button: 0,
            buttons: 0
          }),
          new MouseEvent('click', { 
            bubbles: true, 
            cancelable: true,
            view: window,
            detail: 1,
            button: 0,
            buttons: 0
          })
        ];
        
        for (const event of clickEvents) {
          try {
            newChatButton.dispatchEvent(event);
            await this.delay(50); // 短暂延迟模拟真实点击
          } catch (e) {
            console.warn('触发点击事件失败:', e);
          }
        }
        
        // 也尝试直接调用 click() 方法
        try {
          newChatButton.click();
        } catch (directClickError) {
          console.warn('直接点击失败:', directClickError);
        }
        
        // 等待页面响应
        await this.delay(2000);
        
        // 验证是否成功
        const success = this.verifyNewConversationStarted();
        if (success) {
          console.log('✅ 通过点击按钮成功开启新会话');
        } else {
          console.log('❌ 点击按钮后未能确认新会话状态');
        }
        
        return success;
        
      } catch (error) {
        console.error('点击新建会话按钮失败:', error);
        return false;
      }
    },
    
    // 尝试显示侧边栏
    async tryShowSidebar() {
      console.log('📄 尝试显示侧边栏...');
      
      try {
        // 查找侧边栏切换按钮的选择器
        const sidebarToggleSelectors = [
          '.sidebar-toggle',
          '.menu-toggle',
          '.hamburger',
          '.nav-toggle',
          '[aria-label*="菜单"]',
          '[aria-label*="menu"]',
          '[aria-label*="Menu"]',
          '[data-testid="sidebar-toggle"]'
        ];
        
        for (const selector of sidebarToggleSelectors) {
          const toggleButton = document.querySelector(selector);
          if (toggleButton && toggleButton.offsetParent !== null) {
            console.log(`✅ 找到侧边栏切换按钮: ${selector}`);
            toggleButton.click();
            await this.delay(500);
            return;
          }
        }
        
        console.log('❌ 未找到侧边栏切换按钮');
        
      } catch (error) {
        console.warn('显示侧边栏失败:', error);
      }
    },

    // 验证新会话是否开启
    verifyNewConversationStarted() {
      console.log('🔍 验证新会话是否开启...');
      
      try {
        // 检查 1：URL 路径是否为根路径
        const currentPath = window.location.pathname;
        console.log(`当前URL路径: ${currentPath}`);
        
        const isRootPath = currentPath === '/' || currentPath === '' || currentPath.match(/^\/$/);
        
        // 检查 2：是否存在欢迎消息或空聊天状态
        const welcomeSelectors = [
          '.welcome-message',
          '.chat-welcome', 
          '.empty-chat',
          '.no-messages',
          '.chat-placeholder'
        ];
        
        const hasWelcomeIndicator = welcomeSelectors.some(selector => 
          document.querySelector(selector)
        );
        
        // 检查 3：聊天记录是否为空
        const messageSelectors = [
          '.message',
          '.chat-message', 
          '.segment-user', 
          '.segment-assistant'
        ];
        
        const messageCount = messageSelectors.reduce((count, selector) => 
          count + document.querySelectorAll(selector).length, 0
        );
        
        const emptyMessages = messageCount === 0;
        
        // 检查 4：输入框是否为空
        const inputElement = document.querySelector('.chat-input-editor');
        const inputIsEmpty = !inputElement || !inputElement.textContent || inputElement.textContent.trim() === '';
        
        // 综合判断
        const indicators = {
          isRootPath,
          hasWelcomeIndicator,
          emptyMessages,
          inputIsEmpty
        };
        
        console.log('新会话指示器:', indicators);
        
        // 如果多个指示器为真，则认为是新会话
        const trueCount = Object.values(indicators).filter(Boolean).length;
        const isNewConversation = trueCount >= 2; // 至少2个指示器为真
        
        if (isNewConversation) {
          console.log(`✅ 确认是新会话 (${trueCount}/4 个指示器为真)`);
        } else {
          console.log(`❌ 未确认新会话状态 (${trueCount}/4 个指示器为真)`);
        }
        
        return isNewConversation;
        
      } catch (error) {
        console.error('验证新会话状态失败:', error);
        return false;
      }
    },  
    
    // 使用回车键发送问题 - Kimi专用
    async sendQuestionByEnter(question) {
      console.log(`📤 开始发送问题（使用回车键): ${question}`);
  
      // 🔥 更准确的选择器 - 根据你提供的DOM结构
      const inputSelectors = [
        '.chat-input-editor[data-lexical-editor="true"][contenteditable="true"]',
        '.chat-input-editor[contenteditable="true"]',
        '[data-lexical-editor="true"][contenteditable="true"]',
        '.chat-input-editor',
        '[contenteditable="true"][role="textbox"]'
      ];
      
      let chatInput = null;
      for (const selector of inputSelectors) {
        chatInput = document.querySelector(selector);
        if (chatInput) {
          console.log(`✅ 找到输入框: ${selector}`);
          break;
        }
      }
      
      if (!chatInput) {
        throw new Error('未找到Kimi聊天输入框，请确保在正确的页面');
      }
      
      // 检查输入框是否可见和可用
      if (chatInput.style.display === 'none' || chatInput.offsetParent === null) {
        throw new Error('输入框不可见，请检查页面状态');
      }
      
      console.log('🎯 输入框检查通过，开始设置内容...');
      
      // 确保输入框为空且获得焦点
      chatInput.focus();
      await this.delay(300);
      
      // 检查停止状态
      if (GlobalStopManager.checkStopped()) {
        console.log('🛑 在设置问题内容前检测到停止信号');
        return;
      }
      
      // 使用改进的方法设置问题内容
      console.log('🎯 设置问题内容到输入框...');
      const setSuccess = setNativeValue(chatInput, question);
      if (!setSuccess) {
        throw new Error('设置问题内容失败');
      }
      
      // 等待内容设置完成
      console.log('⏳ 等待输入内容稳定...');
      await this.delay(1500); // 增加等待时间
      
      // 再次检查停止状态
      if (GlobalStopManager.checkStopped()) {
        console.log('🛑 在验证内容前检测到停止信号');
        return;
      }
      
      // 验证输入框内容是否正确设置
      const currentValue = chatInput.textContent || chatInput.innerText || '';
      console.log(`🔍 验证输入框内容: "${currentValue.substring(0, 50)}..."`);
      
      if (!currentValue || !currentValue.includes(question.substring(0, Math.min(10, question.length)))) {
        console.warn('⚠️ 输入框内容可能设置不完整，尝试重新设置...');
        
        // 再次尝试设置，使用不同方法
        chatInput.focus();
        await this.delay(500);
        
        // 🔥 这里调用 simulateTyping 函数，现在应该可以正常工作了
        // 尝试使用键盘输入模拟
        await simulateTyping(chatInput, question);
        await this.delay(800);
      }
      
      // 最终检查停止状态
      if (GlobalStopManager.checkStopped()) {
        console.log('🛑 在发送回车键前检测到停止信号');
        return;
      }
      
      // 确保输入框仍然有焦点
      chatInput.focus();
      await this.delay(200);
      
      // 发送回车键
      console.log('⌨️ 模拟按下回车键发送问题...');
      
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      
      chatInput.dispatchEvent(enterEvent);
      
      // 也触发keyup事件
      const enterUpEvent = new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      
      chatInput.dispatchEvent(enterUpEvent);
      
      // 等待发送处理
      await this.delay(1000);
      
      // 验证发送状态
      console.log('🔍 验证发送状态...');
      const verificationResult = await this.verifyQuestionSent(question);
      
      if (!verificationResult.success) {
        throw new Error(verificationResult.error);
      }
      
      console.log('✅ 问题发送流程完成');
    },

    // 智能验证问题是否成功发送 - Kimi专用
    async verifyQuestionSent(question, maxRetries = 10) {
      console.log('🔍 开始智能验证问题发送状态...');
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // 检查停止状态
        if (GlobalStopManager.checkStopped()) {
          console.log('🛑 在验证发送状态时检测到停止信号');
          return { success: false, error: '用户停止了操作' };
        }
        
        console.log(`🔍 验证尝试 ${attempt}/${maxRetries}`);
        
        const sendButtonContainer = document.querySelector('.send-button-container');
        if (!sendButtonContainer) {
          console.warn('⚠️ 未找到发送按钮容器，等待页面加载...');
          await this.delay(1000);
          continue;
        }
        
        const buttonState = this.getSendButtonState();
        console.log(`🎯 发送按钮状态: ${buttonState}`);
        
        switch (buttonState) {
          case 'generating':
            // 检测到正在生成状态，说明问题已成功发送
            console.log('✅ 问题已成功发送（检测到AI正在生成）');
            return { success: true };
            
          case 'waiting':
            // 等待状态，可能正在处理或已完成
            console.log('⏳ 按钮等待状态，继续监控...');
            await this.delay(1500);
            continue;
            
          case 'ready':
            // 按钮可用状态，可能发送失败，尝试备用方案
            if (attempt <= 3) {
              console.log('⚠️ 发送按钮仍可用，可能回车键发送失败，尝试点击发送按钮...');
              
              // 尝试点击发送按钮作为备用方案
              try {
                const sendButton = sendButtonContainer.querySelector('.send-button');
                if (sendButton) {
                  sendButton.click();
                  console.log('🖱️ 已点击发送按钮作为备用方案');
                  await this.delay(1500);
                  continue;
                }
              } catch (clickError) {
                console.warn('点击发送按钮失败:', clickError);
              }
            } else {
              // 多次尝试后仍然失败
              console.error('❌ 多次尝试发送失败，可能输入内容有问题');
              return { 
                success: false, 
                error: `发送问题失败：多次尝试后发送按钮仍可用，可能输入内容设置不正确。问题内容："${question.substring(0, 50)}..."` 
              };
            }
            break;
            
          default:
            console.warn(`⚠️ 未知的按钮状态: ${buttonState}`);
            await this.delay(1000);
            continue;
        }
      }
      
      // 超过最大重试次数
      console.error('❌ 验证发送状态超时');
      return { 
        success: false, 
        error: '验证发送状态超时：无法确认问题是否成功发送，请检查网络连接或Kimi服务状态' 
      };
    },
    
    // 清理资源
    cleanup() {
      console.log('🧹 清理自动问答器资源...');
      this.isActive = false;
      this.currentTaskId = null;
      this.statusCallback = null;
      
      console.log('✅ 自动问答器资源清理完成');
    },
    
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  };

  // 监听来自content script的消息
  window.addEventListener('message', async function(event) {
    if (event.data.type === 'KIMI_COLLECT_REQUEST') {
      const { action } = event.data;
      
      try {
        if (action === 'startAutoCollection') {
          console.log('🚀 开始自动收集模式...');
          const { taskId, questions } = event.data;
          
          // 立即返回启动成功，任务在后台进行
          window.postMessage({
            type: 'KIMI_COLLECT_RESPONSE',
            action: 'startAutoCollection',
            success: true,
            message: `自动问答已启动，共${questions.length}个问题`
          }, '*');
          
          // 在后台异步启动自动收集任务
          setTimeout(async () => {
            try {
              console.log(`🚀 后台启动自动收集，任务ID: ${taskId}, 问题数量: ${questions.length}`);
              
              // 创建状态回调
              const statusCallback = (progress) => {
                console.log(`📊 自动问答进度: ${progress.current}/${progress.total} - ${progress.message}`);
                
                // 发送进度更新到popup
                window.postMessage({
                  type: 'AUTO_QUESTION_PROGRESS',
                  progress: progress
                }, '*');
              };
              
              const result = await AutoQuestionManager.start(taskId, questions, statusCallback);
              
              console.log(`🎉 自动收集完成:`, result);
              
              // 发送任务完成通知到content script，由其转发到background
              window.postMessage({
                type: 'AUTO_COLLECTION_COMPLETE',
                taskId: taskId,
                success: result.success,
                data: result.data,
                message: result.message
              }, '*');
              
            } catch (error) {
              console.error('💥 后台自动收集失败:', error);
              
              // 发送任务失败通知
              window.postMessage({
                type: 'AUTO_COLLECTION_COMPLETE',
                taskId: taskId,
                success: false,
                data: null,
                error: error.message
              }, '*');
            }
          }, 100); // 100ms后启动，确保响应先发送
        }
  
        // 🔥 新增：处理finishAndExportCollection请求
        else if (action === 'finishAndExportCollection') {
          console.log('📋 处理手动导出请求...');
          
          try {
            // 获取当前已收集的数据
            const collectedData = DataCollectionManager.getData();
            
            if (collectedData.length === 0) {
              // 尝试从AutoQuestionManager获取数据
              const autoData = AutoQuestionManager.getCurrentCollectedData();
              if (autoData.success && autoData.data && autoData.data.length > 0) {
                console.log('📊 从AutoQuestionManager获取到数据:', autoData.data.length);
                
                window.postMessage({
                  type: 'KIMI_COLLECT_RESPONSE',
                  action: 'finishAndExportCollection',
                  success: true,
                  data: autoData.data
                }, '*');
              } else {
                console.log('⚠️ 没有找到可导出的数据');
                
                window.postMessage({
                  type: 'KIMI_COLLECT_RESPONSE',
                  action: 'finishAndExportCollection',
                  success: false,
                  error: '没有收集到任何数据'
                }, '*');
              }
            } else {
              console.log('📊 从DataCollectionManager获取到数据:', collectedData.length);
              
              window.postMessage({
                type: 'KIMI_COLLECT_RESPONSE',
                action: 'finishAndExportCollection',
                success: true,
                data: collectedData
              }, '*');
            }
            
          } catch (exportError) {
            console.error('💥 手动导出处理失败:', exportError);
            
            window.postMessage({
              type: 'KIMI_COLLECT_RESPONSE',
              action: 'finishAndExportCollection',
              success: false,
              error: exportError.message
            }, '*');
          }
        }
  
        // 获取当前已收集数据处理
        else if (action === 'getCurrentCollectedData') {
          console.log('📊 收到获取当前已收集数据请求');
          
          try {
            const result = AutoQuestionManager.getCurrentCollectedData();
            
            console.log('📊 数据获取结果:', {
              success: result.success,
              dataLength: result.data ? result.data.length : 0,
              questionsCount: result.questionsCount,
              totalRecords: result.totalRecords
            });
            
            window.postMessage({
              type: 'KIMI_COLLECT_RESPONSE',
              action: 'getCurrentCollectedData',
              success: result.success,
              data: result.data,
              questionsCount: result.questionsCount,
              totalRecords: result.totalRecords
            }, '*');
            
          } catch (dataError) {
            console.error('💥 获取已收集数据异常:', dataError);
            
            window.postMessage({
              type: 'KIMI_COLLECT_RESPONSE',
              action: 'getCurrentCollectedData',
              success: false,
              error: dataError.message,
              data: [],
              questionsCount: 0,
              totalRecords: 0
            }, '*');
          }
        }
      } catch (error) {
        console.error('💥 处理失败:', error);
        window.postMessage({
          type: 'KIMI_COLLECT_RESPONSE',
          action: event.data.action,
          success: false,
          error: error.message
        }, '*');
      }
    }
    
    // 停止信号处理
    else if (event.data.type === 'KIMI_COLLECT_STOP') {
      const { taskId } = event.data;
      console.log(`🛑 inject.js收到停止信号: ${taskId}`);
      
      // 延迟执行停止操作，给数据获取一些时间
      setTimeout(() => {
        console.log('🚨 延迟后触发全局停止信号...');
        
        // 触发全局停止
        GlobalStopManager.triggerGlobalStop();
        
        // 立即停止所有相关组件
        console.log('🛑 立即停止所有收集组件...');
        
        // 停止自动问答管理器
        AutoQuestionManager.stop();
        
        console.log('✅ 所有收集组件已停止');
        
      }, 1000); // 延迟1秒执行停止操作
      
      // 立即发送停止确认（不等待实际停止完成）
      window.postMessage({
        type: 'KIMI_COLLECT_RESPONSE',
        action: 'stopCollection',
        success: true,
        message: '停止信号已接收，正在安全停止...'
      }, '*');
    }
  });

  // 暴露API到全局
  window.KimiCollector = {
    UnifiedDataCollector: UnifiedDataCollector,
    AutoQuestionManager: AutoQuestionManager,
    GlobalStopManager: GlobalStopManager,
    setNativeValue: setNativeValue
  };

  console.log('✅ Kimi Collector Auto Mode Script 加载完成');
})();