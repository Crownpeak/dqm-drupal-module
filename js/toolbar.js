(function ($, Drupal, once) {
  "use strict";

  const SUPPORTED_LOCALES = ['en', 'de', 'es'];
  const STORAGE_KEY_LOCALE = 'dqm_drupal_module_locale';
  
  let currentLocale = 'en';
  let localeSource = 'default';
  let userOverride = false;
  let aiTranslationManager = null;
  let aiContext = null;

  if (typeof window.AIContextManager !== 'undefined') {
    try {
      const settings = Drupal.settings?.dqmDrupalModule || drupalSettings?.dqmDrupalModule || {};
      console.log('[DQM] Initializing AI features with settings:', settings);
      
      aiContext = new window.AIContextManager({
        openAiApiKey: settings.openai_api_key || '',
        openAiModel: settings.openai_model || 'gpt-4o-mini',
        openAiBaseUrl: settings.openai_base_url || 'https://api.openai.com/v1',
        reasoningEffort: settings.reasoning_effort || 'medium'
      });
      console.log('[DQM] AIContextManager initialized');

      if (typeof window.AITranslationManager !== 'undefined') {
        aiTranslationManager = new window.AITranslationManager(aiContext);
        console.log('[DQM] AITranslationManager initialized');
      } else {
        console.warn('[DQM] AITranslationManager class not found');
      }
    } catch (error) {
      console.error('[DQM] Failed to initialize AI features:', error);
    }
  } else {
    console.warn('[DQM] AIContextManager class not found - translation features will not be available');
  }

  function normalizeLocale(locale) {
    if (!locale) return null;
    const normalized = locale.toLowerCase().split('-')[0];
    return SUPPORTED_LOCALES.includes(normalized) ? normalized : null;
  }

  function persistLocale(locale) {
    if (locale) {
      localStorage.setItem(STORAGE_KEY_LOCALE, locale);
    } else {
      localStorage.removeItem(STORAGE_KEY_LOCALE);
    }
  }

  function resolveLocale() {
    const stored = localStorage.getItem(STORAGE_KEY_LOCALE);
    if (stored) {
      const normalized = normalizeLocale(stored);
      if (normalized) {
        localeSource = 'storage';
        userOverride = true;
        return normalized;
      }
    }

    const browserLang = navigator.language || navigator.userLanguage;
    const normalized = normalizeLocale(browserLang);
    if (normalized) {
      localeSource = 'browser';
      return normalized;
    }

    localeSource = 'default';
    return 'en';
  }

  function changeLanguage(newLocale) {
    const normalized = normalizeLocale(newLocale);
    console.log('[DQM] changeLanguage called with:', newLocale, 'normalized to:', normalized);
    
    if (!normalized) {
      console.warn('[DQM] Invalid locale:', newLocale);
      return false;
    }
    
    if (normalized === currentLocale) {
      console.log('[DQM] Language already set to:', currentLocale);
      return false;
    }
    
    try {
      currentLocale = normalized;
      localeSource = 'user';
      userOverride = true;
      persistLocale(normalized);
      
      console.log('[DQM] Language changed successfully to:', normalized);
      console.log('[DQM] Saved to localStorage:', localStorage.getItem(STORAGE_KEY_LOCALE));
      
      if (aiContext) {
        aiContext.updateLanguage(normalized);
        console.log('[DQM] Updated AI context language');
      }
      
      if (typeof window.DQM_I18N !== 'undefined') {
        window.DQM_I18N.setCurrentLocale(normalized);
        window.DQM_I18N.loadLanguageFile(normalized).then(() => {
          console.log('[DQM] Loaded translations for', normalized);
          updateUITranslations();
        });
      }
      
      return true;
    } catch (error) {
      console.error('[DQM] Failed to change language:', error);
      return false;
    }
  }

  function resetLanguage() {
    persistLocale(null);
    const resolved = resolveLocale();
    currentLocale = resolved;
    return resolved;
  }

  function createLanguageSwitcher() {
    console.log('[DQM] Creating language switcher, current locale:', currentLocale, 'source:', localeSource);
    
    const container = document.createElement('div');
    container.className = 'dqm-language-switcher';

    const button = document.createElement('button');
    button.className = 'dqm-language-button';
    button.setAttribute('aria-label', 'Language');
    button.type = 'button';

    button.innerHTML = '<svg class="dqm-translate-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';

    const menu = document.createElement('div');
    menu.className = 'dqm-language-menu';
    menu.style.display = 'none';
    console.log('[DQM] Language menu created, initial display:', menu.style.display);

    const flagSvg = {
      en: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="14"><rect width="22" height="14" fill="#fff"/><g stroke-width="0"><rect y="0" width="22" height="2" fill="#b22234"/><rect y="3" width="22" height="2" fill="#b22234"/><rect y="6" width="22" height="2" fill="#b22234"/><rect y="9" width="22" height="2" fill="#b22234"/><rect y="12" width="22" height="2" fill="#b22234"/><rect width="10" height="8" fill="#3c3b6e"/></g></svg>',
      de: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="14"><rect width="22" height="14" fill="#ffce00"/><rect y="0" width="22" height="4.67" fill="#000"/><rect y="9.33" width="22" height="4.67" fill="#dd0000"/></svg>',
      es: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="14"><rect width="22" height="14" fill="#c60b1e"/><rect y="4" width="22" height="6" fill="#ffc400"/></svg>'
    };

    const languageNames = {
      en: 'English',
      de: 'German',
      es: 'Spanish'
    };

    SUPPORTED_LOCALES.forEach(function(locale) {
      const menuItem = document.createElement('div');
      menuItem.className = 'dqm-language-menu-item';
      if (locale === currentLocale) {
        menuItem.classList.add('active');
      }

      const flagContainer = document.createElement('div');
      flagContainer.className = 'dqm-flag-container';
      flagContainer.innerHTML = flagSvg[locale];

      const labelContainer = document.createElement('div');
      labelContainer.className = 'dqm-language-label';

      const labelRow = document.createElement('div');
      labelRow.className = 'dqm-language-label-row';

      const languageName = document.createElement('div');
      languageName.className = 'dqm-language-name';
      languageName.textContent = t(languageNames[locale]);

      const code = document.createElement('span');
      code.className = 'dqm-language-code';
      code.textContent = locale.toUpperCase();

      labelRow.appendChild(languageName);
      labelRow.appendChild(code);
      labelContainer.appendChild(labelRow);

      if (locale === currentLocale && localeSource !== 'default') {
        const sourceLabel = document.createElement('div');
        sourceLabel.className = 'dqm-language-source';
        sourceLabel.textContent = localeSource === 'storage' ? t('Custom selected') : t('Browser default');
        labelContainer.appendChild(sourceLabel);
      }

      menuItem.appendChild(flagContainer);
      menuItem.appendChild(labelContainer);

      menuItem.addEventListener('click', function() {
        console.log('[DQM] Language menu item clicked:', locale);
        if (locale !== currentLocale) {
          console.log('[DQM] Changing language from', currentLocale, 'to', locale);
          if (changeLanguage(locale)) {
            console.log('[DQM] Language changed successfully - UI will update automatically');
          }
        }
        menu.style.display = 'none';
      });

      menu.appendChild(menuItem);
    });
    
    console.log('[DQM] Added', SUPPORTED_LOCALES.length, 'language menu items');

    if (userOverride) {
      console.log('[DQM] Adding reset option (userOverride=true)');
      const divider = document.createElement('div');
      divider.className = 'dqm-menu-divider';
      menu.appendChild(divider);

      const resetItem = document.createElement('div');
      resetItem.className = 'dqm-language-menu-item dqm-reset-item';
      resetItem.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg><span>' + t('Reset') + '</span>';
      resetItem.addEventListener('click', function() {
        console.log('[DQM] Reset button clicked');
        resetLanguage();
        window.location.reload();
      });
      menu.appendChild(resetItem);
    }

    button.addEventListener('click', function(e) {
      e.stopPropagation();
      const isVisible = menu.style.display === 'block';
      console.log('[DQM] Language button clicked, menu currently:', isVisible ? 'visible' : 'hidden');
      menu.style.display = isVisible ? 'none' : 'block';
      console.log('[DQM] Menu display set to:', menu.style.display);
    });

    document.addEventListener('click', function(e) {
      if (!container.contains(e.target)) {
        if (menu.style.display === 'block') {
          console.log('[DQM] Closing menu (clicked outside)');
          menu.style.display = 'none';
        }
      }
    });

    container.appendChild(button);
    container.appendChild(menu);

    console.log('[DQM] Language switcher created successfully');
    return container;
  }

  currentLocale = resolveLocale();

  if (typeof window.DQM_I18N !== 'undefined') {
    console.log('[DQM] Initializing i18n for locale:', currentLocale);
    window.DQM_I18N.initializeTranslations(currentLocale).then(() => {
      console.log('[DQM] i18n initialized, updating UI translations');
      updateUITranslations();
    }).catch(error => {
      console.error('[DQM] Failed to initialize i18n:', error);
    });
  } else {
    console.warn('[DQM] DQM_I18N not available - UI translations will not work');
  }

  function t(key) {
    if (typeof window.DQM_I18N !== 'undefined') {
      return window.DQM_I18N.getTranslation(key);
    }
    return key;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }


  function updateUITranslations() {
    console.log('[DQM] Updating UI translations for locale:', currentLocale);
    
    const runCheckButton = document.querySelector('.dqm-drupal-module-run-quality-check');
    if (runCheckButton) {
      const translatedText = t('Run Quality Check');
      runCheckButton.value = translatedText;
      console.log('[DQM] Updated button text to:', translatedText);
    }
    
    const runCheckButtonSecondary = document.querySelector('.dqm-drupal-module-run-quality-check-secondary');
    if (runCheckButtonSecondary) {
      runCheckButtonSecondary.textContent = t('Run Quality Check');
    }
    
    const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
    if (sourceButton) {
      sourceButton.value = t('Source');
    }
    
    const headerTitle = document.querySelector('.dqm-header-title');
    if (headerTitle) {
      headerTitle.textContent = t('title') || 'Digital Quality and Accessibility';
    }
    
    const overviewTitle = document.querySelector('.dqm-overview-section h3');
    if (overviewTitle) {
      overviewTitle.innerHTML = `📊 ${t('Quality Overview')}`;
    }
    
    const legendItems = document.querySelectorAll('.dqm-legend-item span');
    legendItems.forEach((item, index) => {
      const text = item.textContent.trim();
      const match = text.match(/\((\d+)\)/);
      if (match) {
        const count = match[1];
        if (text.toLowerCase().includes('pass') || text.toLowerCase().includes('bestanden') || text.toLowerCase().includes('aprobado')) {
          item.textContent = `${t('Passed')} (${count})`;
        } else if (text.toLowerCase().includes('fail') || text.toLowerCase().includes('fehlgeschlagen') || text.toLowerCase().includes('fallido')) {
          item.textContent = `${t('Failed')} (${count})`;
        }
      }
    });
    
    document.querySelectorAll('.dqm-card h3').forEach(h3 => {
      const text = h3.textContent.trim();
      if (text.includes('Quality Breakdown') || text.includes('Qualitätsübersicht') || text.includes('Desglose de calidad')) {
        h3.innerHTML = `📈 ${t('Quality Breakdown')}`;
      } else if (text.includes('Failed Checkpoints') || text.includes('Fehlgeschlagene Prüfpunkte') || text.includes('Puntos de control fallidos')) {
        const match = text.match(/\((\d+)\)/);
        if (match) {
          h3.innerHTML = `❌ ${t('Failed Checkpoints')} (${match[1]})`;
        }
      }
    });
    
    document.querySelectorAll('.dqm-topic-header span:last-child').forEach(span => {
      const text = span.textContent;
      const match = text.match(/(\d+)\/(\d+)\s+(.+)/i);
      if (match) {
        span.textContent = `${match[1]}/${match[2]} ${t('passed')}`;
      }
    });
    
    const filterLabel = document.querySelector('.dqm-topics-label');
    if (filterLabel) {
      filterLabel.textContent = t('Filter by Topic:');
    }
    
    const allTopicsOption = document.querySelector('.dqm-topics-filter option[value=""]');
    if (allTopicsOption) {
      allTopicsOption.textContent = t('All Topics');
    }
    
    document.querySelectorAll('.badge').forEach(badge => {
      const currentText = badge.textContent.trim();
      
      const reverseMap = {
        'Barrierefreiheit': 'Accessibility',
        'Accesibilidad': 'Accessibility',
        'Marke': 'Brand',
        'Marca': 'Brand',
        'Vorschriften': 'Regulatory',
        'Regulatorio': 'Regulatory',
        'Rechtliches': 'Legal',
        'Benutzerfreundlichkeit': 'Usability',
        'Usabilidad': 'Usability'
      };
      
      const englishKey = reverseMap[currentText] || currentText;
      badge.textContent = t(englishKey);
    });
    
    document.querySelectorAll('.dqm-cannot-highlight').forEach(el => {
      el.textContent = t('Cannot highlight');
    });
    
    document.querySelectorAll('.dqm-language-menu-item').forEach((menuItem, index) => {
      const locales = ['en', 'de', 'es'];
      const locale = locales[index];
      if (locale) {
        if (locale === currentLocale) {
          menuItem.classList.add('active');
        } else {
          menuItem.classList.remove('active');
        }
        
        const languageNames = { en: 'English', de: 'German', es: 'Spanish' };
        const nameElement = menuItem.querySelector('.dqm-language-name, span');
        if (nameElement && !nameElement.classList.contains('dqm-language-code')) {
          nameElement.textContent = t(languageNames[locale]);
        }
        
        const sourceLabel = menuItem.querySelector('.dqm-language-source');
        if (sourceLabel) {
          const text = sourceLabel.textContent.trim();
          if (text.includes('Custom') || text.includes('Durch') || text.includes('Seleccionado')) {
            sourceLabel.textContent = t('Custom selected');
          } else if (text.includes('Browser') || text.includes('Predeterminado')) {
            sourceLabel.textContent = t('Browser default');
          }
        }
      }
    });
    
    const resetItem = document.querySelector('.dqm-reset-item span');
    if (resetItem) {
      resetItem.textContent = t('Reset');
    }
    
    console.log('[DQM] UI translations updated');
  }

  Drupal.behaviors.dqmDrupalModuleToolbar = {
    attach: function (context, settings) {
      try {
        const $document = $(document);
        if (!$document.data('dqm-drupal-module-events-bound')) {
          $document.on('click', '.dqm-drupal-module-run-quality-check, .dqm-drupal-module-run-quality-check-secondary, .dqm-drupal-module-scan-url', function () {
            const method = $(this).hasClass('dqm-drupal-module-scan-url') ? 'url' : 'content';
            try {
              runQualityCheck(this, method);
            } catch (e) {
              const errorPrefix = method === 'url' ? 'Error running URL scan: ' : 'Error running quality check: ';
              alert(errorPrefix + e.message);
            }
          });

          $document.on('click', '.dqm-drupal-module-source-button', function () {
            try {
              showSourceModal(this);
            } catch (e) {
              alert('Error showing source: ' + e.message);
            }
          });

          $document.on('click', '.dqm-drupal-module-page-highlight', function () {
            try {
              togglePageHighlight(this);
            } catch (e) {
              alert('Error toggling page highlight: ' + e.message);
            }
          });

          $document.data('dqm-drupal-module-events-bound', true);
        }

        once('dqm-language-switcher', '.dqm-header-container', context).forEach(function(headerElement) {
          console.log('[DQM] Adding language switcher to header');
          const languageSwitcher = createLanguageSwitcher();
          
          let actionsContainer = headerElement.querySelector('.dqm-header-actions');
          if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.className = 'dqm-header-actions';
            headerElement.appendChild(actionsContainer);
          }
          
          actionsContainer.appendChild(languageSwitcher);
          console.log('[DQM] Language switcher added to header actions');
          
          const aiButton = document.createElement('button');
          aiButton.className = 'dqm-ai-assistant-button';
          aiButton.type = 'button';
          aiButton.setAttribute('aria-label', 'AI Assistant');
          aiButton.innerHTML = `
            <svg class="dqm-ai-icon" focusable="false" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
              <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z"></path>
            </svg>
          `;
          
          aiButton.addEventListener('click', function() {
            showAIAssistantModal();
          });
          
          actionsContainer.appendChild(aiButton);
        });
        
        function showAIAssistantModal() {
          const existingModal = document.querySelector('.dqm-ai-settings-dialog');
          if (existingModal) {
            existingModal.remove();
          }
          
          const settings = drupalSettings.dqmDrupalModule || {};
          const hasOpenAIKey = settings.openai_api_key && settings.openai_api_key.length > 10;
          const accordionExpanded = !hasOpenAIKey;
          
          const translationEnabled = localStorage.getItem('dqm_translation_enabled') === 'true';
          const translationMode = localStorage.getItem('dqm_translation_mode') || 'fast';
          const summaryEnabled = localStorage.getItem('dqm_summary_enabled') === 'true';
          
          const dialogHTML = `
            <div class="dqm-ai-settings-dialog" id="dqm-ai-settings-dialog">
              <div class="dqm-ai-settings-overlay"></div>
              <div class="dqm-ai-settings-content">
                <div class="dqm-ai-settings-header">
                  <div class="dqm-ai-settings-title">
                    <svg class="dqm-ai-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z"/>
                    </svg>
                    <h2>${t('AI Assistant')}</h2>
                  </div>
                  <button class="dqm-dialog-close" id="dqm-ai-settings-close">×</button>
                </div>
                <div class="dqm-ai-settings-body">
                  <div class="dqm-toggle-section">
                    <div class="dqm-toggle-item">
                      <div class="dqm-toggle-info">
                        <strong>${t('Auto-translate DQM results')}</strong>
                        <p class="dqm-toggle-description">${t('When enabled, checkpoint names and descriptions are translated based on your DQM language setting.')}</p>
                      </div>
                      <label class="dqm-switch">
                        <input type="checkbox" id="dqm-translation-toggle" ${translationEnabled ? 'checked' : ''} ${!hasOpenAIKey ? 'disabled' : ''}>
                        <span class="dqm-switch-slider"></span>
                      </label>
                    </div>
                    
                    <div class="dqm-toggle-item">
                      <div class="dqm-toggle-info">
                        <strong>${t('Full translation power')}</strong>
                        <p class="dqm-toggle-description">${t('translation_full_power')}</p>
                      </div>
                      <label class="dqm-switch">
                        <input type="checkbox" id="dqm-translation-mode-toggle" ${translationMode === 'full' ? 'checked' : ''} ${!hasOpenAIKey || !translationEnabled ? 'disabled' : ''}>
                        <span class="dqm-switch-slider"></span>
                      </label>
                    </div>
                    
                    <div class="dqm-toggle-item">
                      <div class="dqm-toggle-info">
                        <strong>${t('AI summary card')}</strong>
                        <p class="dqm-toggle-description">${t('summary_enable')}</p>
                      </div>
                      <label class="dqm-switch">
                        <input type="checkbox" id="dqm-summary-toggle" ${summaryEnabled ? 'checked' : ''} ${!hasOpenAIKey ? 'disabled' : ''}>
                        <span class="dqm-switch-slider"></span>
                      </label>
                    </div>
                  </div>
                  
                  <div class="dqm-accordion" id="dqm-ai-accordion">
                    <div class="dqm-accordion-header ${accordionExpanded ? 'expanded' : ''}" id="dqm-accordion-header">
                      <div class="dqm-accordion-title">
                        <span>${t('ChatGPT (API)')}</span>
                        <div class="dqm-accordion-chips">
                          <span class="dqm-chip">${t('API')}</span>
                          <span class="dqm-chip">${t('Summary')}</span>
                        </div>
                      </div>
                      <svg class="dqm-accordion-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
                      </svg>
                    </div>
                    <div class="dqm-accordion-content ${accordionExpanded ? 'expanded' : ''}" id="dqm-accordion-content">
                      <div class="dqm-ai-info-box">
                        <p>${t('AI may hallucinate or provide inaccurate information. Review results carefully.')}</p>
                      </div>
                      
                      <div class="dqm-field-group">
                        <label>${t('Model')}</label>
                        <div class="dqm-readonly-field">${settings.openai_model || 'gpt-4o-mini'}</div>
                      </div>
                      
                      <div class="dqm-field-group">
                        <label>${t('Base URL')}</label>
                        <div class="dqm-readonly-field">${settings.openai_base_url || 'https://api.openai.com/v1'}</div>
                      </div>
                      
                      <div class="dqm-field-group">
                        <label>${t('API Key Status')}</label>
                        <div class="dqm-readonly-field">
                          <span class="dqm-status-badge ${hasOpenAIKey ? 'configured' : 'not-configured'}">
                            ${hasOpenAIKey ? t('Configured') : t('Not configured')}
                          </span>
                        </div>
                      </div>
                      
                      ${translationEnabled && hasOpenAIKey ? `
                        <div class="dqm-status-section">
                          <div class="dqm-alert dqm-alert-success">
                            <span>${t('Translation is enabled and working')}</span>
                          </div>
                        </div>
                      ` : ''}

                      ${!hasOpenAIKey ? `
                        <div class="dqm-warning-box">
                          <p>${t('To change AI settings, visit')} <a href="/admin/config/system/dqm-drupal-module-settings" target="_blank">${t('Plugin Settings')}</a></p>
                        </div>
                      ` : ''}
                    </div>
                  </div>

                  <div class="dqm-ai-warning-box">
                    <p>${t('AI may hallucinate or provide inaccurate information. Review results carefully.')}</p>
                  </div>

                  <div id="dqm-translation-progress-container" style="display: none;">
                    <div class="dqm-translation-progress">
                      <div class="dqm-translation-status">
                        <strong id="dqm-translation-status-text">${t('Translating...')}</strong>
                      </div>
                      <div class="dqm-progress-bar">
                        <div class="dqm-progress-fill" id="dqm-translation-progress-fill" style="width: 0%"></div>
                      </div>
                      <div class="dqm-progress-text" id="dqm-translation-progress-text">0 / 0 ${t('checkpoints translated')}</div>
                    </div>
                  </div>
                </div>

                <div class="dqm-ai-settings-footer">
                  <button class="dqm-action-btn dqm-action-btn-secondary" id="dqm-ai-clear-cache-btn">
                    ${t('Clear AI cache')}
                  </button>
                  <button class="dqm-action-btn dqm-action-btn-secondary" id="dqm-ai-translate-btn" ${!translationEnabled || !hasOpenAIKey ? 'disabled' : ''}>
                    ${t('Translate missing items')}
                  </button>
                  <button class="dqm-action-btn dqm-action-btn-secondary" id="dqm-ai-restart-summary-btn" ${!summaryEnabled || !hasOpenAIKey ? 'disabled' : ''}>
                    ${t('Restart summary')}
                  </button>
                  <button class="dqm-action-btn dqm-action-btn-primary" id="dqm-ai-close-btn">
                    ${t('Close')}
                  </button>
                </div>
              </div>
            </div>
          `;
          
          document.body.insertAdjacentHTML('beforeend', dialogHTML);
          
          const dialog = document.getElementById('dqm-ai-settings-dialog');
          setTimeout(() => dialog.classList.add('active'), 10);
          
          const closeDialog = () => {
            dialog.classList.remove('active');
            setTimeout(() => dialog.remove(), 300);
          };
          
          document.getElementById('dqm-ai-settings-close').addEventListener('click', closeDialog);
          dialog.querySelector('.dqm-ai-settings-overlay').addEventListener('click', closeDialog);
          
          const accordionHeader = document.getElementById('dqm-accordion-header');
          const accordionContent = document.getElementById('dqm-accordion-content');
          accordionHeader.addEventListener('click', () => {
            accordionHeader.classList.toggle('expanded');
            accordionContent.classList.toggle('expanded');
          });
          
          const translationToggle = document.getElementById('dqm-translation-toggle');
          const translationModeToggle = document.getElementById('dqm-translation-mode-toggle');
          const summaryToggle = document.getElementById('dqm-summary-toggle');
          
          if (translationToggle) {
            translationToggle.addEventListener('change', (e) => {
              localStorage.setItem('dqm_translation_enabled', e.target.checked);
              const modeToggle = document.getElementById('dqm-translation-mode-toggle');
              if (modeToggle) modeToggle.disabled = !e.target.checked;
            });
          }
          
          if (translationModeToggle) {
            translationModeToggle.addEventListener('change', (e) => {
              localStorage.setItem('dqm_translation_mode', e.target.checked ? 'full' : 'fast');
            });
          }
          
          if (summaryToggle) {
            summaryToggle.addEventListener('change', (e) => {
              localStorage.setItem('dqm_summary_enabled', e.target.checked);
            });
          }

          const closeBtnFooter = document.getElementById('dqm-ai-close-btn');
          if (closeBtnFooter) {
            closeBtnFooter.addEventListener('click', closeDialog);
          }

          const clearCacheBtn = document.getElementById('dqm-ai-clear-cache-btn');
          if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
              if (aiTranslationManager) {
                aiTranslationManager.clearCache();
              }
              
              clearCacheBtn.textContent = t('Cache cleared');
              clearCacheBtn.disabled = true;
              setTimeout(() => {
                clearCacheBtn.textContent = t('Clear AI cache');
                clearCacheBtn.disabled = false;
              }, 2000);
            });
          }

          const translateBtn = document.getElementById('dqm-ai-translate-btn');
          if (translateBtn && aiTranslationManager) {
            translateBtn.addEventListener('click', async () => {
              translateBtn.disabled = true;
              const originalText = translateBtn.textContent;
              translateBtn.textContent = t('Translating...');
              
              const progressContainer = document.getElementById('dqm-translation-progress-container');
              const progressFill = document.getElementById('dqm-translation-progress-fill');
              const progressText = document.getElementById('dqm-translation-progress-text');
              const statusText = document.getElementById('dqm-translation-status-text');

              if (progressContainer) progressContainer.style.display = 'block';
              
              if (!translationEnabled) {
                localStorage.setItem('dqm_translation_enabled', 'true');
                if (translationToggle) translationToggle.checked = true;
                if (translationModeToggle) translationModeToggle.disabled = false;
              }

              try {
                const resultsContainer = document.getElementById('dqm-results-container');
                if (resultsContainer && window.dqmFailedCheckpoints && window.dqmFailedCheckpoints.length > 0) {
                  const translatedCheckpoints = await aiTranslationManager.translateCheckpoints(
                    window.dqmFailedCheckpoints,
                    currentLocale,
                    (progress) => {
                      if (progressFill && progressText) {
                        const percent = Math.round((progress.translatedCheckpoints / progress.totalCheckpoints) * 100);
                        progressFill.style.width = `${percent}%`;
                        progressText.textContent = `${progress.translatedCheckpoints} / ${progress.totalCheckpoints} ${t('checkpoints translated')}`;
                      }
                    },
                    true
                  );
                  
                  window.dqmFailedCheckpoints = translatedCheckpoints;
                  
                  translateBtn.textContent = t('Translation complete');
                  if (statusText) statusText.textContent = t('Translation complete');
                  
                  location.reload();
                }
              } catch (error) {
                console.error('Manual translation failed:', error);
                translateBtn.textContent = t('Translation failed');
              } finally {
                setTimeout(() => {
                  if (translateBtn) {
                    translateBtn.disabled = false;
                    translateBtn.textContent = originalText;
                  }
                  if (progressContainer) progressContainer.style.display = 'none';
                }, 2000);
              }
            });
          }

          const restartSummaryBtn = document.getElementById('dqm-ai-restart-summary-btn');
          if (restartSummaryBtn && !restartSummaryBtn.disabled) {
            restartSummaryBtn.addEventListener('click', () => {
              restartSummaryBtn.textContent = t('Restarted');
              restartSummaryBtn.disabled = true;
              setTimeout(() => {
                restartSummaryBtn.textContent = t('Restart summary');
                restartSummaryBtn.disabled = false;
                closeDialog();
              }, 1000);
            });
          }

          dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
              closeDialog();
            }
          });

          document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
              closeDialog();
              document.removeEventListener('keydown', escapeHandler);
            }
          });
        }
      } catch (e) {
        alert('Error initializing DQM toolbar: ' + e.message);
      }
    }
  };

  function runQualityCheck(buttonElement, method) {
    try {
      const $button = $(buttonElement);
      if ($button.data('submitting')) {
        return;
      }
      prepareButtonState($button);
      if (method === 'url') {
        runUrlBasedScan(buttonElement);
      } else {
        runContentBasedScan(buttonElement);
      }
    } catch (e) {
      resetButtonState(buttonElement);
      alert('Error running quality check: ' + e.message);
    }
  }

  function performPageScan(requestData, url, buttonElement, assetKey) {
    $.ajax({
      url: url,
      method: 'POST',
      data: requestData,
      dataType: 'json',
      beforeSend: function (xhr, settings) { },
      success: function (data) {
        try {
          handleScanResponse(data, buttonElement, assetKey);
        } catch (e) {
          resetButtonState(buttonElement);
          alert('Error handling scan response: ' + e.message);
        }
      },
      error: function (xhr, status, error) {
        try {
          handleScanError(xhr, status, error, buttonElement);
        } catch (e) {
          resetButtonState(buttonElement);
          alert('Error handling scan error: ' + e.message);
        }
      }
    });
  }

  function runUrlBasedScan(buttonElement) {
    try {
      const currentUrl = window.location.href;
      const assetKey = 'dqm_asset_id_' + btoa(currentUrl);
      const existingAssetId = localStorage.getItem(assetKey);
      const requestData = {
        url: currentUrl,
        cleanContent: true
      };
      if (existingAssetId) {
        requestData.assetId = existingAssetId;
      }
      performPageScan(requestData, Drupal.url('dqm-drupal-module/scan-from-url'), buttonElement, assetKey);
    } catch (e) {
      resetButtonState(buttonElement);
      alert('Error running URL-based scan: ' + e.message);
    }
  }

  function runContentBasedScan(buttonElement) {
    try {
      const isPreviewPage = window.location.href.includes('/node/preview/') || window.location.href.includes('/preview/');
      let content = isPreviewPage ? extractPreviewContent() : extractRegularPageContent();
      let extractionMethod = isPreviewPage ? 'preview_content_extraction' : 'regular_page_extraction';

      if (!content) {
        resetButtonState(buttonElement);
        return;
      }
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      const pageUrl = window.location.href;
      const assetKey = 'dqm_asset_id_' + btoa(pageUrl);
      const existingAssetId = localStorage.getItem(assetKey);
      const requestData = { content: content };
      if (existingAssetId) {
        requestData.assetId = existingAssetId;
      }
      performPageScan(requestData, Drupal.url('dqm-drupal-module/scan'), buttonElement, assetKey);
    } catch (e) {
      resetButtonState(buttonElement);
      alert('Error running content-based scan: ' + e.message);
    }
  }

  function handleScanResponse(data, buttonElement, assetKey) {
    if (data.success) {
      localStorage.setItem(assetKey, data.assetId);
      fetchQualityResults(data.assetId, buttonElement);
    } else {
      resetButtonState(buttonElement);
      alert('Scan failed: ' + (data.message || 'Unknown error'));
    }
  }

  function handleScanError(xhr, status, error, buttonElement) {
    resetButtonState(buttonElement);
    alert('AJAX error: ' + error);
  }

  function setButtonText($button, text) {
    if ($button.is('input')) {
      $button.val(text);
    } else {
      $button.text(text);
    }
  }

  function prepareButtonState($button) {
    $button.data('submitting', true);
    $button.addClass('loading');
    $button.prop('disabled', true);
    const originalText = $button.val() || $button.text();
    $button.data('original-text', originalText);
    setButtonText($button, 'Running Quality Check...');

    const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
    if (sourceButton) {
      sourceButton.classList.remove('dqm-source-visible');
      sourceButton.style.display = 'none';
    }
  }

  function resetButtonState(buttonElement) {
    const $button = $(buttonElement);
    $button.data('submitting', false);
    $button.removeClass('loading');
    $button.prop('disabled', false);

    const originalText = $button.data('original-text');
    if (originalText) {
      setButtonText($button, originalText);
    }
  }

  function fetchQualityResults(assetId, buttonElement) {
    let resultsContainer = document.getElementById('dqm-results-container');
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.id = 'dqm-results-container';
      resultsContainer.className = 'dqm-results-container';
      buttonElement.parentNode.insertBefore(resultsContainer, buttonElement.nextSibling);
    }

    resultsContainer.innerHTML = '<div class="dqm-loading"><span class="dqm-spinner"></span></div>';

    $.ajax({
      url: Drupal.url('dqm-drupal-module/results/' + assetId),
      method: 'GET',
      dataType: 'json',
      success: function (response) {
        if (response && response.success && response.data && response.data.html) {
          resetButtonState(buttonElement);
          resultsContainer.innerHTML = response.data.html;
        } else if (response.success && response.data) {
          $.ajax({
            url: Drupal.url('dqm-drupal-module/asset-status/' + assetId),
            method: 'GET',
            dataType: 'json',
            success: function (statusData) {
              if (statusData && Array.isArray(statusData.checkpoints)) {
                var canHighlightMap = {};
                statusData.checkpoints.forEach(function (cp) {
                  if (cp && cp.id) {
                    canHighlightMap[cp.id] = cp.canHighlight && typeof cp.canHighlight.page !== 'undefined' ? cp.canHighlight.page : undefined;
                  }
                });
                if (response.data && Array.isArray(response.data.checkpoints)) {
                  response.data.checkpoints.forEach(function (cp) {
                    if (cp && cp.id && typeof canHighlightMap[cp.id] !== 'undefined') {
                      cp._canHighlightPage = canHighlightMap[cp.id];
                    }
                  });
                }
              }
              resetButtonState(buttonElement);
              displayQualityResults(response.data, resultsContainer);
            },
            error: function () {
              resetButtonState(buttonElement);
              displayQualityResults(response.data, resultsContainer);
            }
          });
        } else {
          resetButtonState(buttonElement);
          console.warn('[DQM] Failed to load quality results:', response.message || 'Unknown error');
          resultsContainer.innerHTML = '<div class="dqm-card"><p>Failed to load quality results: ' + (response.message || 'Unknown error') + '</p></div>';
        }
      },
      error: function (xhr, status, error) {
        console.error('[DQM] AJAX error loading quality results:', error, xhr, status);
        resetButtonState(buttonElement);
        resultsContainer.innerHTML = '<div class="dqm-card"><p>Error loading quality results: ' + error + '</p></div>';
      }
    });
  }

  function normaliseCheckpoints(checkpoints) {
    return checkpoints.map(cp => ({
      ...cp,
      topics: (cp?.topics ?? []).sort()
    }));
  }

  function displayQualityResults(data, container) {
    console.log('[DQM] displayQualityResults called with', data?.checkpoints?.length, 'checkpoints');
    console.log('[DQM] Current locale:', currentLocale);
    
    if (!data || !data.checkpoints || !Array.isArray(data.checkpoints)) {
      container.innerHTML = '<div class="dqm-card"><p>No quality results available.</p></div>';
      return;
    }

    if (currentLocale !== 'en' && aiTranslationManager && data.checkpoints.length > 0) {
      console.log('[DQM] ✅ Will translate checkpoint CONTENT to:', currentLocale);
      console.log('[DQM] Note: UI text is already translated via i18n JSON files');
      
      const translateAndDisplay = async () => {
        try {
          console.log('[DQM] 🌍 Starting AI translation of checkpoint content to', currentLocale);
          console.log('[DQM] Step 1: Translating checkpoint titles (fast)');
          
          await aiTranslationManager.translateCheckpoints(
            data.checkpoints,
            currentLocale,
            (progress) => {
              console.log('[DQM] 📊 Title translation progress:', progress);
            },
            true 
          );
          
          console.log('[DQM] ✅ Checkpoint titles translated');
          console.log('[DQM] Step 2: Translating full checkpoint content');
          
          await aiTranslationManager.translateCheckpoints(
            data.checkpoints,
            currentLocale,
            (progress) => {
              console.log('[DQM] 📊 Full content translation progress:', progress);
            },
            false 
          );
          
          console.log('[DQM] ✅ Full checkpoint content translation complete');
          console.log('[DQM] Re-rendering UI with translated checkpoint data');
          renderQualityResults(data, container);
        } catch (error) {
          console.error('[DQM] ❌ Checkpoint translation failed:', error);
          console.error('[DQM] Error details:', error.message, error.stack);
          console.log('[DQM] Falling back to English checkpoint content');
          renderQualityResults(data, container);
        }
      };
      
      translateAndDisplay();
      return;
    } else {
      if (currentLocale === 'en') {
        console.log('[DQM] ⏭️ Skipping checkpoint translation (English selected)');
      } else if (!aiTranslationManager) {
        console.log('[DQM] ⏭️ Skipping checkpoint translation (AI manager not available)');
      } else {
        console.log('[DQM] ⏭️ Skipping checkpoint translation (no checkpoints)');
      }
    }

    console.log('[DQM] Rendering results (UI text from i18n, checkpoint content in English)');
    renderQualityResults(data, container);
  }

  function renderQualityResults(data, container) {

    const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
    if (sourceButton) {
      sourceButton.classList.remove('dqm-source-visible');
      sourceButton.style.display = 'none';
    }

    const topicColors = {
      'Accessibility': '#006675',
      'SEO': '#2fe8b6',
      'Brand': '#3636c5',
      'Regulatory': '#b604d4',
      'Legal': '#001746',
      'Usability': '#cdd1d0'
    };

    const checkpoints = normaliseCheckpoints(data.checkpoints);
    let passedCount = 0;
    const totalCount = checkpoints.length;
    const failedCheckpoints = [];
    const topicCounts = {};

    for (const checkpoint of checkpoints) {
      if (checkpoint.failed === true) {
        failedCheckpoints.push(checkpoint);
      } else {
        passedCount++;
      }

      for (const topic of checkpoint.topics) {
        if (!topicCounts[topic]) {
          topicCounts[topic] = {
            total: 0,
            passed: 0,
            failed: 0,
            color: topicColors[topic] || '#888',
            className: topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')
          };
        }

        topicCounts[topic].total++;
        if (checkpoint.failed === true) {
          topicCounts[topic].failed++;
        } else {
          topicCounts[topic].passed++;
        }
      }
    }

    for (const [key, value] of Object.entries(topicCounts)) {
      topicCounts[key].percent = value.total > 0 ? Math.round((value.passed / value.total) * 100) : 0;
    }

    const sortedTopics = Object.keys(topicCounts).sort();
    const percent = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
    const failedCount = totalCount - passedCount;

    let html = `
      <div class="dqm-card dqm-overview-section">
        <h3>📊 ${t('Quality Overview')}</h3>
        <div class="dqm-chart-container">
          <div class="dqm-pie-chart" data-percent="${percent}">
            <div class="percent-label">${percent}%</div>
          </div>
          <div class="dqm-legend">
            <div class="dqm-legend-item">
              <div class="dqm-legend-color passed"></div>
              <span>${t('Passed')} (${passedCount})</span>
            </div>
            <div class="dqm-legend-item">
              <div class="dqm-legend-color failed"></div>
              <span>${t('Failed')} (${failedCount})</span>
            </div>
          </div>
        </div>
      </div>
    `;

    let topicsHtml = '';
    for (const name of sortedTopics) {
      const topic = topicCounts[name];
      if (topicsHtml.length > 0) {
        topicsHtml += '<hr class="dqm-divider">';
      }
      topicsHtml += `<div class="dqm-topic-breakdown">
        <div class="dqm-topic-header">
          <span class="dqm-topic-badge" style="background:${topic.color}">${name}</span>
          <span>${topic.passed}/${topic.total} ${t('passed')}</span>
        </div>
        <div class="dqm-progress-bar">
          <div class="dqm-progress-fill" style="width:${topic.percent}%;background:${topic.color}"></div>
        </div>
      </div>`;
    }

    html += `<div class="dqm-card">
      <h3>📈 ${t('Quality Breakdown')}</h3>
      ${topicsHtml}
    </div>`;

    if (failedCheckpoints.length > 0) {
      let topicsFilterHtml = '';
      let topicOptionsHtml = '';

      for (const topic of sortedTopics) {
        const topicInfo = topicCounts[topic];
        if (topicInfo.failed > 0) {
          const count = topicInfo.total - topicInfo.passed;
          topicOptionsHtml += `<option value="${topicInfo.className}">${topic} (${count})</option>`;
        }
      }

      if (topicOptionsHtml.length > 0) {
        topicsFilterHtml = `<div class="dqm-filter-container">
          <select class="dqm-topics-filter" id="dqm-topics-filter">
            <option value="all">All Topics (${failedCheckpoints.length})</option>
            ${topicOptionsHtml}
          </select>
        </div>`;
      }

      let failedCheckpointsHtml = '';
      for (const checkpoint of failedCheckpoints) {
        let checkpointBadgesHtml = '';
        if (checkpoint.topics.length > 0) {
          const badgesHtml = checkpoint.topics.map(topic => {
            const badgeClassName = topicCounts[topic] ? topicCounts[topic].className : '';
            return `<span class="badge ${badgeClassName}">${t(topic)}</span>`;
          }).join('');
          checkpointBadgesHtml = `<div class="checkpoint-badges" style="display:flex;margin-top:4px;">${badgesHtml}</div>`;
        }
        const topicClasses = checkpoint.topics.map((topic) => 'topic-' + topicCounts[topic].className).join(' ');
        let cannotHighlightHtml = '';
        let notHighlightable = false;

        if (checkpoint.hasOwnProperty('_canHighlightPage') && checkpoint._canHighlightPage === false &&
            checkpoint.canHighlight && checkpoint.canHighlight.source === false) {
          cannotHighlightHtml = `<span class="dqm-cannot-highlight">${t('Cannot highlight')}</span>`;
          notHighlightable = true;
        }
        else if (checkpoint.canHighlight && 
                checkpoint.canHighlight.page === false && 
                checkpoint.canHighlight.source === false) {
          cannotHighlightHtml = `<span class="dqm-cannot-highlight">${t('Cannot highlight')}</span>`;
          notHighlightable = true;
        }
        let notClickableClass = notHighlightable ? ' not-highlightable' : '';
        failedCheckpointsHtml += `<div class="dqm-checkpoint-item${notClickableClass} ${topicClasses}" data-topics="${checkpoint.topics.join(',')}" data-error-id="${checkpoint.id}">
          <div class="checkpoint-icon-title-row">
            <div class="checkpoint-icon failed dqm-info-icon" data-id="${checkpoint.id}">!</div>
            <div>
              <span class="checkpoint-title">${checkpoint.name || 'Unknown Checkpoint'}</span>
              ${checkpointBadgesHtml}
              ${cannotHighlightHtml}
            </div>
          </div>
        </div>`;
      }

      html += `<div class="dqm-card">
        <h3>❌ ${t('Failed Checkpoints')} (${failedCheckpoints.length})</h3>
        <div class="dqm-topics-filter-container">
          <label class="dqm-topics-label">${t('Filter by Topic:')}</label>
          <select class="dqm-topics-filter">
            <option value="">${t('All Topics')}</option>
            ${topicOptionsHtml}
          </select>
        </div>
        <div class="dqm-checkpoints-list" id="dqm-checkpoints-list">
          ${failedCheckpointsHtml}
        </div>
      </div>`;
    }
    html += `<button class="dqm-drupal-module-run-quality-check-secondary button">${t('Run Quality Check')}</button>`;

    setTimeout(function () {
      const checkpointItems = container.querySelectorAll('.dqm-checkpoint-item[data-error-id]');
      checkpointItems.forEach(function (item) {
        if (item.classList.contains('not-highlightable')) {
          return;
        }
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          const isActive = this.classList.contains('active');
          if (isActive) {
            this.classList.remove('active');
            hideSourceButton();
            document.querySelectorAll('.dqm-element-highlight').forEach(function (el) {
              el.classList.remove('dqm-element-highlight');
              if (el.hasAttribute('data-dqm-original-style')) {
                el.setAttribute('style', el.getAttribute('data-dqm-original-style'));
                el.removeAttribute('data-dqm-original-style');
              } else {
                el.removeAttribute('style');
              }
            });
            
            const mainCanvas = document.querySelector('.dialog-off-canvas-main-canvas');
            if (mainCanvas && mainCanvas.hasAttribute('data-original-content')) {
              const originalContent = mainCanvas.getAttribute('data-original-content');
              mainCanvas.innerHTML = originalContent;
              mainCanvas.removeAttribute('data-original-content');
              
              const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
              if (sourceButton) {
                setButtonText($(sourceButton), 'Source');
              }
            }
            
            return;
          }
          
          checkpointItems.forEach(function (i) { i.classList.remove('active'); });
          this.classList.add('active');
          
          const errorId = this.getAttribute('data-error-id');
          const checkpoint = failedCheckpoints.find(cp => cp.id === errorId);
          
          document.querySelectorAll('.dqm-element-highlight').forEach(function (el) {
            el.classList.remove('dqm-element-highlight');
            if (el.hasAttribute('data-dqm-original-style')) {
              el.setAttribute('style', el.getAttribute('data-dqm-original-style'));
              el.removeAttribute('data-dqm-original-style');
            } else {
              el.removeAttribute('style');
            }
          });
          
          if (checkpoint && checkpoint.canHighlight) {
            if (
              checkpoint.canHighlight.source === true &&
              checkpoint.canHighlight.page === false
            ) {
              hideSourceButton();
              const mainCanvas = document.querySelector(
                ".dialog-off-canvas-main-canvas"
              );
              if (
                mainCanvas &&
                !mainCanvas.hasAttribute("data-original-content")
              ) {
                mainCanvas.setAttribute(
                  "data-original-content",
                  mainCanvas.innerHTML
                );
              }
              showSourceModalWithHighlight(
                document.querySelector(".dqm-drupal-module-source-button"),
                errorId
              );
              return;
            } else if (
              checkpoint.canHighlight.source === true &&
              checkpoint.canHighlight.page === true
            ) {
              showSourceButton();
              const mainCanvas = document.querySelector(
                ".dialog-off-canvas-main-canvas"
              );
              if (
                mainCanvas &&
                mainCanvas.hasAttribute("data-original-content")
              ) {
                const originalContent = mainCanvas.getAttribute(
                  "data-original-content"
                );
                mainCanvas.innerHTML = originalContent;
                mainCanvas.removeAttribute("data-original-content");

                const sourceButton = document.querySelector(
                  ".dqm-drupal-module-source-button"
                );
                if (sourceButton) {
                  setButtonText($(sourceButton), "Source");
                }
              }
            } else {
              hideSourceButton();
              const mainCanvas = document.querySelector(
                ".dialog-off-canvas-main-canvas"
              );
              if (
                mainCanvas &&
                mainCanvas.hasAttribute("data-original-content")
              ) {
                const originalContent = mainCanvas.getAttribute(
                  "data-original-content"
                );
                mainCanvas.innerHTML = originalContent;
                mainCanvas.removeAttribute("data-original-content");
              }
            }
          }
          
          if (!errorId) return;
          const assetKey = 'dqm_asset_id_' + btoa(window.location.href);
          const assetId = localStorage.getItem(assetKey);
          if (!assetId) {
            alert('No asset ID found for this page. Please run a quality check first.');
            return;
          }
          if (checkpoint && checkpoint.canHighlight && 
              checkpoint.canHighlight.source === true && 
              checkpoint.canHighlight.page === false) {
            return;
          }
          
          $.ajax({
            url: Drupal.url('dqm-drupal-module/error-highlight/' + assetId + '/' + errorId),
            method: 'GET',
            dataType: 'json',
            success: function (response) {
              if (typeof response === 'object' && response !== null && response.message) {
                var lowerMsg = response.message.toLowerCase().trim();
                if (lowerMsg.includes('unsupported for checkpoint')) {
                  const checkpoint = failedCheckpoints.find(cp => cp.id === errorId);
                  if (checkpoint && checkpoint.canHighlight && checkpoint.canHighlight.source === true) {
                    return;
                  } else {
                    alert('Highlighting is unsupported for this specific checkpoint.');
                    return;
                  }
                } else if (lowerMsg.includes('unsupported')) {
                  alert(response.message);
                  return;
                }
              }
              if (!response.success || !response.html) {
                alert('Failed to fetch highlight for this error.');
                return;
              }
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = response.html;
              const highlightEl = tempDiv.querySelector('[style*="background:yellow"], [style*="background: yellow"], [style*="background-color:yellow"], [style*="background-color: yellow"]');
              
              if (highlightEl) {
                let found = false;
                const highlightStyle = 'background: yellow !important; border: 2px solid red !important;';

                let textToFind = highlightEl.textContent.trim();
                const allElements = document.querySelectorAll('*');
                for (const el of allElements) {
                  if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(el.tagName)) {
                    continue;
                  }
                  
                  if (el.textContent.trim() === textToFind) {
                    if (!el.hasAttribute('data-dqm-original-style')) {
                      el.setAttribute('data-dqm-original-style', el.getAttribute('style') || '');
                    }
                    el.setAttribute('style', (el.getAttribute('style') || '') + '; ' + highlightStyle);
                    el.classList.add('dqm-element-highlight');
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  
                  const innerElements = highlightEl.querySelectorAll('*');
                  for (const innerEl of innerElements) {
                    const innerText = innerEl.textContent.trim();
                    if (innerText.length > 10) {
                      const tagName = innerEl.tagName;
                      
                      for (const pageEl of allElements) {
                        if (pageEl.tagName === tagName && 
                            pageEl.textContent.trim() === innerText &&
                            !['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(pageEl.tagName)) {
                          if (!pageEl.hasAttribute('data-dqm-original-style')) {
                            pageEl.setAttribute('data-dqm-original-style', pageEl.getAttribute('style') || '');
                          }
                          pageEl.setAttribute('style', (pageEl.getAttribute('style') || '') + '; ' + highlightStyle);
                          pageEl.classList.add('dqm-element-highlight');
                          found = true;
                          break;
                        }
                      }
                      if (found) break;
                    }
                  }
                }
                if (!found) {
                  const words = textToFind.split(' ').filter(word => word.length > 3);
                  if (words.length > 0) {
                    let bestMatch = null;
                    let bestScore = 0;
                    
                    for (const el of allElements) {   
                     
                      if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(el.tagName)) {
                        continue;
                      }
                      
                      const elText = el.textContent.trim();
                      if (elText.length > 10) {
                        let score = 0;
                        for (const word of words) {
                          if (elText.toLowerCase().includes(word.toLowerCase())) {
                            score++;
                          }
                        }
                        const similarity = score / words.length;
                        if (similarity > bestScore && similarity > 0.6) {
                          bestScore = similarity;
                          bestMatch = el;
                        }
                      }
                    }
                    
                    if (bestMatch) {
                      if (!bestMatch.hasAttribute('data-dqm-original-style')) {
                        bestMatch.setAttribute('data-dqm-original-style', bestMatch.getAttribute('style') || '');
                      }
                      bestMatch.setAttribute('style', (bestMatch.getAttribute('style') || '') + '; ' + highlightStyle);
                      bestMatch.classList.add('dqm-element-highlight');
                      found = true;
                    }
                  }
                }
                
                if (!found) {
                  alert('Could not find the matching content to highlight on this page.');
                }
              } else {
                alert('No highlightable element found in the API response.');
              }
            },
            error: function (xhr) {
              let msg = 'Failed to fetch highlight for this error.';
              if (xhr && xhr.status === 400 && xhr.responseText) {
                try {
                  var errObj = JSON.parse(xhr.responseText);
                  if (errObj && errObj.message) {
                    var lowerMsg = errObj.message.toLowerCase().trim();
                    if (lowerMsg.includes('unsupported for checkpoint')) {
                      return;
                    } else if (lowerMsg.includes('unsupported')) {
                      msg = errObj.message;
                    }
                  }
                } catch (e) { }
              }
              alert(msg);
            }
          });
        });
      });
    }, 0);

    container.innerHTML = html;

    
    const assetKey = 'dqm_asset_id_' + btoa(window.location.href);
    const assetId = localStorage.getItem(assetKey);
    if (assetId && data.checkpoints) {
      generateAISummary(assetId, data.checkpoints);
    }

    const pieChart = container.querySelector('.dqm-pie-chart');
    if (pieChart) {
      const percentage = parseInt(pieChart.getAttribute('data-percent') || '0');
      const passedDegrees = Math.round((percentage / 100) * 360);
      const failedDegrees = 360 - passedDegrees;

      const background = (passedDegrees > 0) ? `conic-gradient(#b604d4 0deg ${passedDegrees}deg, #303747 ${passedDegrees}deg 360deg)` : `#303747`;
      pieChart.style.background = background;
    }

    let modal = document.getElementById('dqm-checkpoint-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dqm-checkpoint-modal';
      modal.className = 'dqm-modal';
      Object.assign(modal.style, {
        display: 'none',
        position: 'fixed',
        zIndex: '9999',
        background: '#fff',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        borderRadius: '8px',
        padding: '1.5em 2em 1.5em 1.5em',
        minWidth: '340px',
        maxWidth: '420px',
        maxHeight: '70vh',
        overflowY: 'auto',
        transition: 'opacity 0.2s',
        opacity: '1'
      });
      document.body.appendChild(modal);
    }

    function showModal(cp) {
      modal.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'dqm-modal-title';
      title.textContent = cp.name || '';
      modal.appendChild(title);
      if (cp.description) {
        const desc = document.createElement('div');
        desc.className = 'dqm-modal-desc';
        desc.textContent = cp.description;
        modal.appendChild(desc);
      }
      if (cp.topics.length > 0) {
        const topicsDiv = document.createElement('div');
        topicsDiv.className = 'dqm-modal-topics';
        topicsDiv.innerHTML = cp.topics.map(topic => {
          const badgeClassName = topicCounts[topic] ? topicCounts[topic].className : '';
          return `<span class="badge ${badgeClassName}">${topic}</span>`;
        }).join(' ');
        modal.appendChild(topicsDiv);
      }
      Object.assign(modal.style, {
        display: 'block',
        opacity: '1',
        top: '32px',
        left: '32px',
        right: ''
      });
    }
    const infoIcons = container.querySelectorAll('.dqm-info-icon');
    for (const icon of infoIcons) {
      icon.addEventListener('mouseenter', function (e) {
        const id = icon.getAttribute('data-id');
        const cp = failedCheckpoints.find(cp => cp.id === id);
        if (cp) {
          showModal(cp);
        }
      });
      icon.addEventListener('mouseleave', function (e) {
        setTimeout(function () {
          modal.style.display = 'none';
        }, 200);
      });
    }
    modal.addEventListener('mouseenter', function () {
      modal.style.display = 'block';
    });
    modal.addEventListener('mouseleave', function () {
      modal.style.display = 'none';
    });

    const filterSelect = container.querySelector('#dqm-topics-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', function (e) {
        const selectedTopic = e.target.value;
        const checkpointItems = container.querySelectorAll('.dqm-checkpoint-item');
        let visibleCount = 0;

        checkpointItems.forEach(function (item) {
          if (selectedTopic === 'all') {
            item.style.display = 'flex';
            visibleCount++;
          } else {
            const itemTopics = item.getAttribute('data-topics') || '';
            const topicArray = itemTopics.split(',').map(function (topic) {
              return topic.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            });

            if (topicArray.indexOf(selectedTopic) !== -1) {
              item.style.display = 'flex';
              visibleCount++;
            } else {
              item.style.display = 'none';
            }
          }
        });

        const cardTitle = container.querySelector('.dqm-card h3');
        if (cardTitle && selectedTopic !== 'all') {
          const selectedTopicName = e.target.options[e.target.selectedIndex].text.split(' (')[0];
          cardTitle.textContent = '❌ ' + t('Failed Checkpoints') + ' - ' + selectedTopicName + ' (' + visibleCount + ')';
        } else if (cardTitle) {
          cardTitle.textContent = '❌ ' + t('Failed Checkpoints') + ' (' + failedCheckpoints.length + ')';
        }
      });
    }
    const pageHighlightBtn = container.querySelector('.dqm-drupal-module-page-highlight');
    if (pageHighlightBtn) {
      pageHighlightBtn.addEventListener('click', function () {
        try {
          togglePageHighlight(this);
        } catch (e) {
          alert('Error toggling page highlight: ' + e.message);
        }
      });
    }

    window.dqmFailedCheckpoints = failedCheckpoints
  }

  function showSourceButton() {
    const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
    if (sourceButton) {
      sourceButton.classList.add('dqm-source-visible');
      sourceButton.style.display = 'block';
    }
  }

  function hideSourceButton() {
    const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
    if (sourceButton) {
      sourceButton.classList.remove('dqm-source-visible');
      sourceButton.style.display = 'none';
    }
  }

  function extractPreviewContent() {
    const contentSelectors = [
      '.node-preview',
      '.node--view-mode-full',
      '.node',
      'main .content',
      'main',
      '.main-content',
      '.page-content',
      '#main-content',
      '[role="main"]'
    ];

    let contentElement = null;

    for (let i = 0; i < contentSelectors.length; i++) {
      contentElement = document.querySelector(contentSelectors[i]);
      if (contentElement) {
        break;
      }
    }

    if (!contentElement) {
      return extractCleanBodyContent();
    }
    const contentClone = contentElement.cloneNode(true);
    removeAdminElements(contentClone);
    return createCleanHtmlStructure(contentClone.outerHTML);
  }

  function extractRegularPageContent() {
    const html = document.querySelector('.dialog-off-canvas-main-canvas');
    if (!html) {
      return extractCleanBodyContent();
    }

    const htmlClone = html.cloneNode(true);
    removeAdminElements(htmlClone);
    return createCleanHtmlStructure(htmlClone.innerHTML);
  }

  function extractCleanBodyContent() {
    const bodyClone = document.body.cloneNode(true);

    removeAdminElements(bodyClone);
    return createCleanHtmlStructure(bodyClone.innerHTML);
  }

  function removeAdminElements(element) {
    const adminSelectors = [
      '.toolbar',
      '.toolbar-bar',
      '.toolbar-tray',
      '#toolbar-administration',
      '.admin-toolbar',
      '.contextual-links-wrapper',
      '.contextual',
      '.local-tasks',
      '.local-actions',
      '.messages',
      '.breadcrumb',
      '[data-drupal-messages]',
      '.system-breadcrumb',
      '.tabs',
      '.tabs--primary',
      '.tabs--secondary',
      '.action-links',
      '.admin-menu',
      '.shortcuts',
      '#edit-actions',
      '.form-actions',
      '.dqm-drupal-module-toolbar-item',
      '.dqm-results-container',
      '[id*="edit-"]',
      '[class*="edit-"]',
      'script',
      'noscript',
      '.visually-hidden',
      '.sr-only',
      '.hidden',
      '[style*="display: none"]',
      '[style*="display:none"]'
    ];

    let removedCount = 0;

    for (const selector of adminSelectors) {
      const elements = element.querySelectorAll(selector);
      for (const el of elements) {
        el.remove();
        removedCount++;
      }
    }

    const allElements = element.querySelectorAll('*');
    for (const el of allElements) {
      if (el.className && typeof el.className === 'string') {
        if (el.className.includes('admin') ||
          el.className.includes('toolbar') ||
          el.className.includes('contextual') ||
          el.className.includes('edit-') ||
          el.className.includes('form-') ||
          el.className.includes('drupal-')) {
          if (!el.className.includes('content') &&
            !el.className.includes('node') &&
            !el.className.includes('field') &&
            !el.className.includes('text')) {
            el.remove();
            removedCount++;
          }
        }
      }

      if (el.hasAttribute('data-drupal-selector') ||
        el.hasAttribute('data-quickedit-entity-id') ||
        el.hasAttribute('data-contextual-id')) {
        el.removeAttribute('data-drupal-selector');
        el.removeAttribute('data-quickedit-entity-id');
        el.removeAttribute('data-contextual-id');
      }
    }

    return element;
  }

  function createCleanHtmlStructure(bodyContent) {
    const pageTitle = document.title || 'Page Content';

    const descMeta = document.querySelector('meta[name="description"]');
    const metaDescription = descMeta ? '<meta name="description" content="' + descMeta.getAttribute('content') + '">' : '';

    const lang = document.documentElement.lang || 'en';

    return `<!DOCTYPE html>
    <html lang="${lang}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${metaDescription}
            <title>${pageTitle}</title>
        </head>
        <body>${bodyContent}</body>
    </html>`;
  }

  function addLocalHighlighting() {
    if (!$('#dqm-highlight-styles').length) {
      $('head').append('<style id="dqm-highlight-styles">' +
        '.dqm-element-highlight { outline: 2px dashed #b604d4 !important; outline-offset: 2px !important; }' +
        '.dqm-element-highlight:hover { outline: 3px solid #b604d4 !important; }' +
        '</style>');
    }
    $('main h1, main h2, main h3, main h4, main h5, main h6, main p, main img, main figure, main table, main ul, main ol, article h1, article h2, article h3, article h4, article h5, article h6, article p, article img, article figure, article table, article ul, article ol').addClass('dqm-element-highlight');
  }

  function togglePageHighlight(buttonElement) {
    try {
      const $button = $(buttonElement);
      const isHighlightActive = $button.hasClass('active');

      if (isHighlightActive) {
        $('.dqm-element-highlight').each(function () {
          $(this).removeClass('dqm-element-highlight');
        });

        $('#dqm-highlight-overlay').remove();
        $('#dqm-highlight-styles').remove();

        $button.removeClass('active');
        $button.val(Drupal.t('Page Highlight'));
      } else {
        $button.prop('disabled', true);

        const currentUrl = window.location.href;
        const assetKey = 'dqm_asset_id_' + btoa(currentUrl);
        const existingAssetId = localStorage.getItem(assetKey);

        if (!existingAssetId) {
          addLocalHighlighting();
          $button.addClass('active');
          $button.val(Drupal.t('Page Highlighting'));
          $button.prop('disabled', false);
          return;
        }

        let apiKey;
        try {
          if (drupalSettings && drupalSettings.dqmDrupalModule && drupalSettings.dqmDrupalModule.apiKey) {
            apiKey = drupalSettings.dqmDrupalModule.apiKey;
          } else {
            console.warn('API key not found in drupalSettings');
            addLocalHighlighting();
            $button.addClass('active');
            $button.val(Drupal.t('Page Highlighting'));
            $button.prop('disabled', false);
            return;
          }
        } catch (e) {
          console.warn('Error accessing drupalSettings:', e);
          addLocalHighlighting();
          $button.addClass('active');
          $button.val(Drupal.t('Remove Highlight'));
          resetButtonState($button);
          return;
        }

        $.ajax({
          url: Drupal.url('dqm-drupal-module/highlight/' + existingAssetId),
          method: 'GET',
          data: {
            visibility: 'public'
          },
          contentType: 'text/html',
          success: function (response) {
            try {
              if (!$('#dqm-highlight-styles').length) {
                $('head').append('<style id="dqm-highlight-styles">' +
                  '.dqm-element-highlight { outline: 2px dashed #b604d4 !important; outline-offset: 2px !important; }' +
                  '.dqm-element-highlight:hover { outline: 3px solid #b604d4 !important; }' +
                  '</style>');
              }

              const tempDiv = document.createElement('div');
              tempDiv.style.display = 'none';
              tempDiv.innerHTML = response;
              document.body.appendChild(tempDiv);

              let foundElements = false;

              $(tempDiv).find('.dqm-element-highlight').each(function () {
                const tagName = this.tagName.toLowerCase();
                const text = $(this).text().trim();

                if (text) {
                  $(`${tagName}`).each(function () {
                    if ($(this).text().trim() === text) {
                      $(this).addClass('dqm-element-highlight');
                      foundElements = true;
                    }
                  });
                }
              });

              if (!foundElements) {
                console.log('No matching elements found, applying fallback highlighting');
                $('main h1, main h2, main h3, main h4, main h5, main h6, main p, main img, main figure, main table, main ul, main ol, article h1, article h2, article h3, article h4, article h5, article h6, article p, article img, article figure, article table, article ul, article ol').addClass('dqm-element-highlight');
              }

              document.body.removeChild(tempDiv);

              $button.addClass('active');
              $button.val(Drupal.t('Page Highlighting'));
            } catch (e) {
              console.error('Error processing highlight response:', e);
              alert('Error processing highlight data: ' + e.message);
              $('main h1, main h2, main h3, main h4, main h5, main h6, main p, main img, main figure, main table, main ul, main ol, article h1, article h2, article h3, article h4, article h5, article h6, article p, article img, article figure, article table, article ul, article ol').addClass('dqm-element-highlight');
            }
            $button.prop('disabled', false);
          },
          error: function (xhr, status, error) {
            console.error('API error:', xhr, status, error);
            addLocalHighlighting();
            $button.addClass('active');
            $button.val(Drupal.t('Page Highlighting'));
            $button.prop('disabled', false);
          }
        });
      }
    } catch (e) {
      console.error('Error in togglePageHighlight:', e);
      alert('Error toggling page highlight: ' + e.message);
      resetButtonState($(buttonElement));
    }
  }

  function showSourceModal(buttonElement) {
  try {
    const $button = $(buttonElement);
    if ($button.data('loading')) {
      return;
    }

    const mainCanvas = document.querySelector('.dialog-off-canvas-main-canvas');
    if (!mainCanvas) {
      alert('Main canvas area not found');
      return;
    }

    const isShowingSource = mainCanvas.hasAttribute('data-original-content');

    const activeCheckpoint = document.querySelector('.dqm-checkpoint-item.active');
    let isSourceOnly = false;
    let shouldHighlightError = false;
    let activeErrorId = null;
    
    if (activeCheckpoint) {
      const errorId = activeCheckpoint.getAttribute('data-error-id');
      const checkpoint = window.dqmFailedCheckpoints?.find(cp => cp.id === errorId);
      if (checkpoint && checkpoint.canHighlight) {
        if (checkpoint.canHighlight.source === true && checkpoint.canHighlight.page === false) {
          isSourceOnly = true;
        } else if (checkpoint.canHighlight.source === true && checkpoint.canHighlight.page === true) {
          shouldHighlightError = true;
          activeErrorId = errorId;
        }
      }
    }

    if (isShowingSource && !isSourceOnly) {
      const originalContent = mainCanvas.getAttribute('data-original-content');
      if (originalContent) {
        mainCanvas.innerHTML = originalContent;
        mainCanvas.removeAttribute('data-original-content');
        setButtonText($button, 'Source');
      }
      return;
    }

    const currentUrl = window.location.href;
    const assetKey = 'dqm_asset_id_' + btoa(currentUrl);
    const existingAssetId = localStorage.getItem(assetKey);

    if (!existingAssetId) {
      alert('No asset ID found for this page. Please run a quality check first.');
      return;
    }

    $button.data('loading', true);
    $button.prop('disabled', true);
    setButtonText($button, 'Loading...');

    if (!isSourceOnly) {
      mainCanvas.setAttribute('data-original-content', mainCanvas.innerHTML);
    }

    mainCanvas.innerHTML = `
      <div class="dqm-source-container">
        <div class="dqm-source-loading">
          <span class="dqm-spinner"></span>
          Loading source code...
        </div>
        <div class="dqm-source-code" style="display: none;"></div>
      </div>
    `;

    let endpoint, loadingText;
    if (shouldHighlightError && activeErrorId) {
      endpoint = Drupal.url('dqm-drupal-module/error-highlight-source/' + existingAssetId + '/' + activeErrorId);
      loadingText = 'Loading highlighted source code...';
    } else {
      endpoint = Drupal.url('dqm-drupal-module/source/' + existingAssetId);
      loadingText = 'Loading source code...';
    }
    const loadingElement = mainCanvas.querySelector('.dqm-source-loading');
    if (loadingElement) {
      loadingElement.innerHTML = `<span class="dqm-spinner"></span>${loadingText}`;
    }

    $.ajax({
      url: endpoint,
      method: 'GET',
      dataType: 'json',
      success: function (response) {
        try {
          if (response && response.success && response.html) {
            const codeElement = mainCanvas.querySelector('.dqm-source-code');
            const loadingElement = mainCanvas.querySelector('.dqm-source-loading');

            if (codeElement && loadingElement) {
              if (shouldHighlightError && activeErrorId) {
                const shadow = codeElement.attachShadow({ mode: "open" });
                shadow.innerHTML = response.html;
              } else {
                const shadow = codeElement.attachShadow({ mode: "open" });
                shadow.innerHTML = `<pre style="font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; white-space: pre-wrap; margin: 0;">${response.html}</pre>`;
              }
              
              loadingElement.style.display = 'none';
              codeElement.style.display = 'block';
              
              if (isSourceOnly) {
                setButtonText($button, 'Source');
              } else {
                setButtonText($button, 'Browser');
              }
              if (shouldHighlightError && activeErrorId) {
                setTimeout(function() {
                  scrollToHighlightedCode(mainCanvas);
                }, 200);
              }
            }
          } else {
            const loadingElement = mainCanvas.querySelector('.dqm-source-loading');
            if (loadingElement) {
              loadingElement.innerHTML = 'Error: ' + (response.message || 'Failed to load source');
            }
          }
        } catch (e) {
          const loadingElement = mainCanvas.querySelector('.dqm-source-loading');
          if (loadingElement) {
            loadingElement.innerHTML = 'Error processing response: ' + e.message;
          }
        }
      },
      error: function (xhr, status, error) {
        const loadingElement = mainCanvas.querySelector('.dqm-source-loading');
        if (loadingElement) {
          loadingElement.innerHTML = 'Error loading source: ' + error;
        }
      },
      complete: function () {
        $button.data('loading', false);
        $button.prop('disabled', false);
      }
    });

  } catch (e) {
    alert('Error showing source: ' + e.message);
    const $button = $(buttonElement);
    $button.data('loading', false);
    $button.prop('disabled', false);
    if (!isSourceOnly) {
      const originalContent = mainCanvas.getAttribute('data-original-content');
      if (originalContent) {
        mainCanvas.innerHTML = originalContent;
        mainCanvas.removeAttribute('data-original-content');
        setButtonText($button, 'Source');
      }
    }
  }
}

  function showSourceModalWithHighlight(buttonElement, errorId) {
    try {
      const $button = $(buttonElement);
      if ($button.data("loading")) {
        return;
      }

      const mainCanvas = document.querySelector(
        ".dialog-off-canvas-main-canvas"
      );
      if (!mainCanvas) {
        alert("Main canvas area not found");
        return;
      }

      const currentUrl = window.location.href;
      const assetKey = "dqm_asset_id_" + btoa(currentUrl);
      const existingAssetId = localStorage.getItem(assetKey);

      if (!existingAssetId) {
        alert(
          "No asset ID found for this page. Please run a quality check first."
        );
        return;
      }

      $button.data("loading", true);
      $button.prop("disabled", true);
      setButtonText($button, "Loading...");
      if (!mainCanvas.hasAttribute("data-original-content")) {
        mainCanvas.setAttribute("data-original-content", mainCanvas.innerHTML);
      }

      mainCanvas.innerHTML = `
      <div class="dqm-source-container">
        <div class="dqm-source-loading">
          <span class="dqm-spinner"></span>
          Loading highlighted source code...
        </div>
        <div class="dqm-source-code" style="display: none;"></div>
      </div>
    `;

      $.ajax({
        url: Drupal.url(
          "dqm-drupal-module/error-highlight-source/" +
            existingAssetId +
            "/" +
            errorId
        ),
        method: "GET",
        dataType: "json",
        success: function (response) {
          try {
            if (response && response.success && response.html) {
              const codeElement = mainCanvas.querySelector(".dqm-source-code");
              const loadingElement = mainCanvas.querySelector(
                ".dqm-source-loading"
              );

              if (codeElement && loadingElement) {
                const shadow = codeElement.attachShadow({ mode: "open" });
                shadow.innerHTML = response.html;
                loadingElement.style.display = "none";
                codeElement.style.display = "block";

                setButtonText($button, "Browser");
                setTimeout(function() {
                  scrollToHighlightedCode(mainCanvas);
                }, 100);
              }
            } else {
              const loadingElement = mainCanvas.querySelector(
                ".dqm-source-loading"
              );
              if (loadingElement) {
                loadingElement.innerHTML =
                  "Error: " +
                  (response.message || "Failed to load highlighted source");
              }
            }
          } catch (e) {
            const loadingElement = mainCanvas.querySelector(
              ".dqm-source-loading"
            );
            if (loadingElement) {
              loadingElement.innerHTML =
                "Error processing response: " + e.message;
            }
          }
        },
        error: function (xhr, status, error) {
          const loadingElement = mainCanvas.querySelector(
            ".dqm-source-loading"
          );
          if (loadingElement) {
            loadingElement.innerHTML =
              "Error loading highlighted source: " + error;
          }
        },
        complete: function () {
          $button.data("loading", false);
          $button.prop("disabled", false);
        },
      });
    } catch (e) {
      alert("Error showing highlighted source: " + e.message);
      const $button = $(buttonElement);
      $button.data("loading", false);
      $button.prop("disabled", false);
    }
  }

  function scrollToHighlightedCode(container) {
    try {
      let highlightedElement = null;

      highlightedElement = container.querySelector("tr.astError, td.astError");

      if (!highlightedElement) {
        const errorIconCells = container.querySelectorAll("td.errorIcon");
        errorIconCells.forEach((cell) => {
          if (cell.innerHTML !== "&nbsp;" && cell.innerHTML.trim() !== "") {
            highlightedElement = cell.closest("tr");
          }
        });
      }

      if (!highlightedElement) {
        highlightedElement = container.querySelector(
          "td.content span.astError, td.content span.astHighlightFull"
        );
      }

      if (!highlightedElement) {
        highlightedElement = container.querySelector(
          ".astError.astHighlightFull, .astError, .astHighlightFull"
        );
      }

      if (!highlightedElement) {
        highlightedElement = container.querySelector(
          '[style*="background:yellow"], [style*="background-color:yellow"], [style*="background: yellow"]'
        );
      }

      if (!highlightedElement) {
        highlightedElement = container.querySelector(
          'span[style*="background"], td[style*="background"]'
        );
      }

      if (
        highlightedElement &&
        (highlightedElement.tagName === "SPAN" ||
          highlightedElement.tagName === "TD")
      ) {
        const parentRow = highlightedElement.closest("tr");
        if (parentRow) {
          highlightedElement = parentRow;
        }
      }

      if (highlightedElement) {
        const sourceContainer =
          container.querySelector(".dqm-source-code, pre, #sourceViewTable") ||
          container;

        const elementRect = highlightedElement.getBoundingClientRect();
        const containerRect = sourceContainer.getBoundingClientRect();

        let scrollTop;
        if (sourceContainer.scrollTop !== undefined) {
          scrollTop =
            elementRect.top -
            containerRect.top +
            sourceContainer.scrollTop -
            100;
        } else {
          scrollTop = highlightedElement.offsetTop - 100;
        }

        if (sourceContainer.scrollTo) {
          sourceContainer.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: "smooth",
          });
        } else if (sourceContainer.scrollTop !== undefined) {
          sourceContainer.scrollTop = Math.max(0, scrollTop);
        } else {
          container.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: "smooth",
          });
        }

        highlightedElement.style.transition = "background-color 0.3s ease";
        const originalBackground = highlightedElement.style.backgroundColor;
        highlightedElement.style.backgroundColor = "rgba(182, 4, 212, 0.2)";

        setTimeout(function () {
          if (highlightedElement.style) {
            highlightedElement.style.backgroundColor = originalBackground;
            highlightedElement.style.transition = "";
          }
        }, 2000);
      }
    } catch (e) {
      console.error("Error scrolling to highlighted code:", e);
    }
  }

  function generateAISummary(assetId, checkpoints) {
    const container = document.getElementById('dqm-ai-summary-container');
    if (!container) {
      console.warn('[DQM] AI summary container not found');
      return;
    }

    const settings = drupalSettings.dqmDrupalModule || {};
    const summaryEnabled = localStorage.getItem('dqm_summary_enabled') === 'true';
    const hasOpenAIKey = settings.openai_api_key && settings.openai_api_key.length > 10;

    if (!summaryEnabled || !hasOpenAIKey) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `
      <div class="dqm-card dqm-ai-summary-card">
        <div class="dqm-ai-summary-header">
          <div class="dqm-ai-header-left">
            <svg class="dqm-ai-sparkle-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z"/>
            </svg>
            <h3>${t('AI Summary')}</h3>
            <span class="dqm-ai-badge">${t('ChatGPT')}</span>
          </div>
        </div>
        <div class="dqm-ai-loading">
          <div class="dqm-spinner"></div>
          <p>${t('Generating summary...')}</p>
        </div>
      </div>
    `;

    const currentLang = localStorage.getItem('dqm_target_lang') || 'en';

    fetch(Drupal.url('dqm-drupal-module/ai-summary'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        assetId: assetId,
        checkpoints: JSON.stringify(checkpoints),
        targetLang: currentLang
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success && data.bullets && Array.isArray(data.bullets)) {
        const bulletHTML = data.bullets.map(bullet => `<li>${escapeHtml(bullet)}</li>`).join('');
        
        container.innerHTML = `
          <div class="dqm-card dqm-ai-summary-card">
            <div class="dqm-ai-summary-header">
              <div class="dqm-ai-header-left">
                <svg class="dqm-ai-sparkle-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z"/>
                </svg>
                <h3>${t('AI Summary')}</h3>
                <span class="dqm-ai-badge">${t('ChatGPT')}</span>
              </div>
              <div class="dqm-ai-header-right">
                <button class="dqm-ai-icon-btn" id="dqm-ai-settings-btn" title="${t('AI Settings')}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                  </svg>
                </button>
                <button class="dqm-ai-icon-btn" id="dqm-ai-regenerate-header-btn" title="${t('Regenerate')}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                  </svg>
                </button>
              </div>
            </div>
            <ul class="dqm-ai-bullets">${bulletHTML}</ul>
            <div class="dqm-ai-footer">
              <div class="dqm-ai-footer-left">
                <span class="dqm-ai-model">${data.stats.model || 'gpt-4o-mini'}</span>
                <span class="dqm-ai-stats">${data.stats.failedCheckpoints}/${data.stats.totalCheckpoints} ${t('failed')}</span>
              </div>
              <button class="dqm-ai-regenerate-btn" id="dqm-ai-regenerate-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
                ${t('Regenerate')}
              </button>
            </div>
          </div>
        `;
        
        
        const settingsBtn = document.getElementById('dqm-ai-settings-btn');
        if (settingsBtn) {
          settingsBtn.addEventListener('click', () => {
            const aiAssistantBtn = document.querySelector('.dqm-ai-assistant-button');
            if (aiAssistantBtn) {
              aiAssistantBtn.click();
            }
          });
        }
        
        const regenerateHandler = () => {
          console.log('[DQM] Regenerating AI summary');
          
          container.innerHTML = `
            <div class="dqm-card dqm-ai-summary-card">
              <div class="dqm-ai-summary-header">
                <div class="dqm-ai-header-left">
                  <svg class="dqm-ai-sparkle-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z"/>
                  </svg>
                  <h3>${t('AI Summary')}</h3>
                  <span class="dqm-ai-badge">${t('ChatGPT')}</span>
                </div>
              </div>
              <div class="dqm-ai-loading">
                <div class="dqm-spinner"></div>
                <p>${t('Regenerating summary...')}</p>
              </div>
            </div>
          `;
          
          generateAISummary(assetId, checkpoints);
        };

        const regenerateHeaderBtn = document.getElementById('dqm-ai-regenerate-header-btn');
        if (regenerateHeaderBtn) {
          regenerateHeaderBtn.addEventListener('click', regenerateHandler);
        }

        const regenerateFooterBtn = document.getElementById('dqm-ai-regenerate-btn');
        if (regenerateFooterBtn) {
          regenerateFooterBtn.addEventListener('click', regenerateHandler);
        }
      } else {
        container.innerHTML = `
          <div class="dqm-card dqm-ai-summary-card dqm-error">
            <p>${t('Error')}: ${data.message || t('Failed to generate summary')}</p>
          </div>
        `;
      }
    })
    .catch(error => {
      console.error('[DQM] AI summary generation failed:', error);
      container.innerHTML = `
        <div class="dqm-card dqm-ai-summary-card dqm-error">
          <p>${t('Error')}: ${t('Failed to generate summary')}</p>
        </div>
      `;
    });
  }

  window.dqmFailedCheckpoints = [];

})(jQuery, Drupal, window.once);
