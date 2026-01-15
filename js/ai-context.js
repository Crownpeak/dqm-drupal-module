/**
 * AI Context Manager - Centralized configuration and settings for AI features
 * Mirrors the React component's AIContext.tsx architecture
 * 
 * Manages:
 * - Translation settings (enabled, mode)
 * - Summary settings
 * - OpenAI credentials
 * - localStorage synchronization
 * - Configuration from props/WordPress options
 */

(function(window) {
    'use strict';

    /**
     * Storage keys for AI settings (matching React component)
     */
    const AI_STORAGE_KEYS = {
        translationEnabled: 'dqm_translate_results_enabled',
        translationMode: 'dqm_translation_mode',
        translationDialogOpen: 'dqm_translation_dialog_open',
        summaryEnabled: 'dqm_ai_summary_enabled',
        openaiApiKey: 'dqm_openai_apiKey',
        openaiModel: 'dqm_openai_model',
        openaiBaseUrl: 'dqm_openai_baseUrl',
        targetLanguage: 'dqm_target_language',
        reasoningEffort: 'dqm_reasoning_effort',
        computeBudgetMs: 'dqm_compute_budget_ms'
    };

    /**
     * AI Configuration (matching React component's structure)
     */
    const AI_CONFIG = {
        translation: {
            enabledByDefault: false,
            computeBudgetMs: 15000,
            modes: {
                fast: { timeout: 15000, maxRetries: 2 },
                full: { timeout: 120000, maxRetries: 3 }
            },
            persistentCache: true,
            cacheExpiry: 24 * 60 * 60 * 1000
        },
        summary: {
            timeoutMs: 45000,
            maxRetries: 2,
            persistentCache: true,
            cacheExpiry: 24 * 60 * 60 * 1000
        },
        retry: {
            maxAttempts: 3,
            backoffMs: 1000,
            backoffMultiplier: 2
        }
    };

    /**
     * AI Context Manager Class
     * Equivalent to React's AIProvider + useAI hook
     */
    class AIContextManager {
        constructor(config = {}) {
            this.config = {
                translation: { ...AI_CONFIG.translation, ...config.translation },
                summary: { ...AI_CONFIG.summary, ...config.summary }
            };

            this._listeners = new Set();
            this._state = this._initializeState();
            this._setupStorageSync();
        }

        /**
         * Initialize state from localStorage and config
         * Mirrors React component's useState initialization
         */
        _initializeState() {
            return {
                translationEnabled: this._getInitialBooleanState(
                    AI_STORAGE_KEYS.translationEnabled,
                    this.config.translation.enabledByDefault || false
                ),
                translationMode: this._getStorageItem(AI_STORAGE_KEYS.translationMode) === 'full' ? 'full' : 'fast',
                translationDialogOpen: false,
                summaryEnabled: this._getInitialBooleanState(
                    AI_STORAGE_KEYS.summaryEnabled,
                    true
                ),
                openAiApiKey: this._getStorageItem(AI_STORAGE_KEYS.openaiApiKey) || '',
                openAiModel: this._getStorageItem(AI_STORAGE_KEYS.openaiModel) || 'gpt-5.2',
                openAiBaseUrl: this._getStorageItem(AI_STORAGE_KEYS.openaiBaseUrl) || 'https://api.openai.com/v1',
                reasoningEffort: this._getValidReasoningEffort(
                    this._getStorageItem(AI_STORAGE_KEYS.reasoningEffort)
                ),
                targetLang: 'en',
                translationNeeded: false,
                aiEnabled: false,
                computeBudgetMs: 15000,
                effectiveModelId: 'gpt-5.2',
                
                summaryState: 'idle',
                summaryGenerating: false,
                translationState: 'idle'
            };
        }

        _getInitialBooleanState(key, defaultValue) {
            if (typeof window === 'undefined' || !window.localStorage) {
                return defaultValue;
            }
            const stored = this._getStorageItem(key);
            if (stored === null) return defaultValue;
            return stored === 'true';
        }

        _getStorageItem(key) {
            if (typeof window === 'undefined' || !window.localStorage) {
                return null;
            }
            try {
                return localStorage.getItem(key);
            } catch (e) {
                console.warn('[AIContext] Failed to get storage item:', key, e);
                return null;
            }
        }

        _setStorageItem(key, value) {
            if (typeof window === 'undefined' || !window.localStorage) {
                return;
            }
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                console.warn('[AIContext] Failed to set storage item:', key, e);
            }
        }

        _getValidReasoningEffort(value) {
            if (value === 'low' || value === 'medium' || value === 'high') {
                return value;
            }
            return 'low';
        }

        /**
         * Setup automatic localStorage synchronization
         * Mirrors React component's useEffect hooks
         */
        _setupStorageSync() {
            this._storageWatchers = {
                translationEnabled: (value) => this._setStorageItem(
                    AI_STORAGE_KEYS.translationEnabled,
                    value ? 'true' : 'false'
                ),
                translationMode: (value) => this._setStorageItem(
                    AI_STORAGE_KEYS.translationMode,
                    value
                ),
                summaryEnabled: (value) => this._setStorageItem(
                    AI_STORAGE_KEYS.summaryEnabled,
                    value ? 'true' : 'false'
                ),
                openAiApiKey: (value) => this._setStorageItem(
                    AI_STORAGE_KEYS.openaiApiKey,
                    value
                ),
                openAiModel: (value) => this._setStorageItem(
                    AI_STORAGE_KEYS.openaiModel,
                    value
                ),
                openAiBaseUrl: (value) => this._setStorageItem(
                    AI_STORAGE_KEYS.openaiBaseUrl,
                    value
                ),
                reasoningEffort: (value) => this._setStorageItem(
                    AI_STORAGE_KEYS.reasoningEffort,
                    value
                )
            };
        }

        /**
         * Update state and sync to localStorage
         */
        _setState(updates) {
            const oldState = { ...this._state };
            this._state = { ...this._state, ...updates };

            Object.keys(updates).forEach(key => {
                if (this._storageWatchers[key]) {
                    this._storageWatchers[key](updates[key]);
                }
            });

            this._recalculateDerivedValues();
            this._notifyListeners(oldState, this._state);
        }

        /**
         * Recalculate derived values (like useMemo in React)
         */
        _recalculateDerivedValues() {
            const currentLanguage = (window.DQM_i18n && window.DQM_i18n.getCurrentLocale) 
                ? window.DQM_i18n.getCurrentLocale() 
                : 'en';
            
            this._state.targetLang = currentLanguage.split('-')[0];
            this._state.translationNeeded = this._state.targetLang !== 'en';
            this._state.aiEnabled = this._state.summaryEnabled || 
                                     this._state.translationEnabled || 
                                     this._state.targetLang === 'en';

            const baseBudget = this.config.translation.computeBudgetMs || 15000;
            this._state.computeBudgetMs = this._state.translationMode === 'full' 
                ? 120000 
                : baseBudget;

            this._state.effectiveModelId = this._state.openAiModel.trim() || 'gpt-5.2';

            this._state.summaryGenerating = this._state.summaryEnabled && 
                (this._state.summaryState === 'generating' || this._state.summaryState === 'idle');
        }

        /**
         * Subscribe to state changes
         */
        subscribe(listener) {
            this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        }

        /**
         * Notify all listeners of state changes
         */
        _notifyListeners(oldState, newState) {
            this._listeners.forEach(listener => {
                try {
                    listener(newState, oldState);
                } catch (e) {
                    console.error('[AIContext] Listener error:', e);
                }
            });
        }

        getState() {
            return { ...this._state };
        }

        setTranslationEnabled(value) {
            this._setState({ translationEnabled: value });
        }

        setTranslationMode(value) {
            this._setState({ translationMode: value });
        }

        setTranslationDialogOpen(value) {
            this._setState({ translationDialogOpen: value });
        }

        setSummaryEnabled(value) {
            this._setState({ summaryEnabled: value });
        }

        setOpenAiApiKey(value) {
            this._setState({ openAiApiKey: value });
        }

        setOpenAiModel(value) {
            this._setState({ openAiModel: value });
        }

        setOpenAiBaseUrl(value) {
            this._setState({ openAiBaseUrl: value });
        }

        setReasoningEffort(value) {
            const validValue = this._getValidReasoningEffort(value);
            this._setState({ reasoningEffort: validValue });
        }

        setSummaryState(state) {
            this._setState({ summaryState: state });
        }

        setTranslationState(state) {
            this._setState({ translationState: state });
        }

        updateLanguage(locale) {
            this._recalculateDerivedValues();
        }

        getConfig() {
            return this.config;
        }

        getAIConfig() {
            return AI_CONFIG;
        }

        getStorageKeys() {
            return AI_STORAGE_KEYS;
        }

        isTranslationReady() {
            const state = this.getState();
            return state.translationEnabled && 
                   state.openAiApiKey && 
                   state.openAiApiKey.length > 10;
        }

        isSummaryReady() {
            const state = this.getState();
            return state.summaryEnabled && 
                   state.openAiApiKey && 
                   state.openAiApiKey.length > 10;
        }

        isAIReady() {
            return this.isTranslationReady() || this.isSummaryReady();
        }

        shouldWaitForSummary() {
            const state = this.getState();
            return state.summaryGenerating;
        }
    }

    window.AIContextManager = AIContextManager;
    window.AI_STORAGE_KEYS = AI_STORAGE_KEYS;
    window.AI_CONFIG = AI_CONFIG;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { AIContextManager, AI_STORAGE_KEYS, AI_CONFIG };
    }

})(typeof window !== 'undefined' ? window : global);
