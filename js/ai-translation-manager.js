
class AITranslationManager {
    constructor(aiContext) {
        if (!aiContext) {
            throw new Error('AITranslationManager requires AIContextManager instance');
        }
        
        this.aiContext = aiContext;
        this.translationCache = {};
        this.translationState = 'idle';
        this.translationProgress = {
            translatedCheckpoints: 0,
            totalCheckpoints: 0
        };
        this.translationError = null;
        this.abortController = null;
        this.checkpointTranslationStatus = {};
        this.titlesTranslated = false;
        
        this.STORAGE_KEYS = aiContext.getStorageKeys();
        this.CONFIG = aiContext.getAIConfig();
        
        this.loadPersistentCache();
        
        this._unsubscribe = aiContext.subscribe((newState, oldState) => {
            if (newState.translationState !== oldState.translationState) {
                this.translationState = newState.translationState;
            }
        });
    }
    
    destroy() {
        if (this._unsubscribe) {
            this._unsubscribe();
        }
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    isTranslationNeeded(targetLang) {
        return targetLang && targetLang !== 'en';
    }

    isTranslationReady() {
        return this.aiContext.isTranslationReady();
    }

    getTranslationMode() {
        const state = this.aiContext.getState();
        return state.translationMode || 'fast';
    }

    getToggleState(key) {
        const state = this.aiContext.getState();
        const keyMap = {
            'translationEnabled': 'translationEnabled',
            'translationMode': 'translationMode',
            'summaryEnabled': 'summaryEnabled',
            'openaiApiKey': 'openAiApiKey',
            'openaiModel': 'openAiModel',
            'openaiBaseUrl': 'openAiBaseUrl',
            'targetLanguage': 'targetLang',
            'reasoningEffort': 'reasoningEffort',
            'computeBudgetMs': 'computeBudgetMs'
        };
        
        const mappedKey = keyMap[key] || key;
        return state[mappedKey] ? state[mappedKey].toString() : null;
    }

    loadPersistentCache() {
        if (!this.CONFIG.translation.persistentCache) return;
        if (typeof window === 'undefined' || !window.localStorage) return;
        
        try {
            const cached = localStorage.getItem(this.STORAGE_KEYS.translationCache);
            if (!cached) return;
            
            const data = JSON.parse(cached);
            const now = Date.now();
            const expiry = this.CONFIG.translation.cacheExpiry;
            
            Object.keys(data).forEach(key => {
                const entry = data[key];
                if (entry && entry.timestamp && (now - entry.timestamp) < expiry) {
                    this.translationCache[key] = entry.data;
                }
            });
        } catch (e) {
            console.warn('[AITranslationManager] Failed to load persistent cache:', e);
        }
    }

    saveToPersistentCache(cacheKey, data) {
        if (!this.CONFIG.translation.persistentCache) return;
        if (typeof window === 'undefined' || !window.localStorage) return;
        
        try {
            const cached = localStorage.getItem(this.STORAGE_KEYS.translationCache);
            const cacheData = cached ? JSON.parse(cached) : {};
            
            cacheData[cacheKey] = {
                data: data,
                timestamp: Date.now()
            };
            
            localStorage.setItem(this.STORAGE_KEYS.translationCache, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('[AITranslationManager] Failed to save to persistent cache:', e);
        }
    }

    getComputeBudget() {
        const mode = this.getTranslationMode();
        const config = this.CONFIG.translation.modes[mode] || this.CONFIG.translation.modes.fast;
        const customBudget = this.getToggleState('computeBudgetMs');
        return customBudget ? parseInt(customBudget, 10) : config.timeout;
    }

    getMaxRetries() {
        const mode = this.getTranslationMode();
        const config = this.CONFIG.translation.modes[mode] || this.CONFIG.translation.modes.fast;
        return config.maxRetries;
    }

    async translateCheckpoints(checkpoints, targetLang, onProgress, titlesOnly = false) {
        if (!this.isTranslationReady()) {
            throw new Error('OpenAI API key is not configured');
        }

        if (!this.isTranslationNeeded(targetLang)) {
            return checkpoints;
        }

        while (this.aiContext.shouldWaitForSummary()) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const failedCheckpoints = checkpoints.filter(cp => cp.failed === true);
        
        if (failedCheckpoints.length === 0) {
            return checkpoints;
        }

        const cacheKey = `${targetLang}_${this.getTranslationMode()}_${titlesOnly ? 'titles_' : ''}${this.generateCheckpointHash(failedCheckpoints)}`;

        if (this.translationCache[cacheKey]) {
            return this.translationCache[cacheKey];
        }

        this.translationState = 'initializing';
        this.aiContext.setTranslationState('initializing');
        this.translationProgress = {
            translatedCheckpoints: 0,
            totalCheckpoints: failedCheckpoints.length
        };
        this.translationError = null;
        this.abortController = new AbortController();

        if (onProgress) {
            onProgress(this.translationProgress, this.translationState);
        }

        const translatedCheckpoints = [];
            this.aiContext.setTranslationState('translating');
        const batchSize = 10;
        let batchStart = 0;

        try {
            this.translationState = 'translating';

            while (batchStart < failedCheckpoints.length) {
                if (this.abortController.signal.aborted) {
                    throw new Error('Translation aborted');
                }

                const formData = new FormData();
                formData.append('action', 'crownpeak_dqm_translate');
                formData.append('checkpoints', JSON.stringify(failedCheckpoints));
                formData.append('targetLang', targetLang);
                formData.append('batchStart', batchStart);
                formData.append('batchSize', batchSize);
                formData.append('titlesOnly', titlesOnly ? '1' : '0');
                formData.append('computeBudgetMs', this.getComputeBudget());

                const maxRetries = this.getMaxRetries();
                let retryCount = 0;
                let response = null;
                let lastError = null;

                while (retryCount <= maxRetries) {
                    try {
                        const drupalUrl = typeof Drupal !== 'undefined' && Drupal.url 
                            ? Drupal.url('dqm-drupal-module/translate')
                            : '/dqm-drupal-module/translate';
                        
                        response = await fetch(drupalUrl, {
                            method: 'POST',
                            body: formData,
                            signal: this.abortController.signal
                        });

                        if (response.ok) {
                            break;
                        }

                        lastError = new Error(`Translation request failed: ${response.statusText}`);
                    } catch (error) {
                        lastError = error;
                    }

                    retryCount++;
                    if (retryCount <= maxRetries) {
                        const backoffMs = this.CONFIG.retry.backoffMs * Math.pow(this.CONFIG.retry.backoffMultiplier, retryCount - 1);
                        await new Promise(resolve => setTimeout(resolve, backoffMs));
                    }
                }

                if (!response || !response.ok) {
                    throw lastError || new Error('Translation request failed after retries');
                }

                const data = await response.json();

                if (!data.success) {

                    this.translationState = data.state || 'partial';
                    this.translationError = data.message || 'Translation failed';

                    console.error('[AITranslationManager] Translation error:', {
                        message: data.message,
                        state: data.state,
                        translatedSoFar: translatedCheckpoints.length
                    });

                    if (onProgress) {
                        onProgress(this.translationProgress, this.translationState, this.translationError);
                    }

                    if (translatedCheckpoints.length > 0) {
                        return this.mergeTranslations(checkpoints, translatedCheckpoints);
                    }

                    throw new Error(data.message || 'Translation failed');
                }

                if (data.translatedCheckpoints && Array.isArray(data.translatedCheckpoints)) {
                    translatedCheckpoints.push(...data.translatedCheckpoints);

                    data.translatedCheckpoints.forEach(tc => {
                        this.checkpointTranslationStatus[tc.id] = titlesOnly ? 'title' : 'full';
                    });
                }

                if (data.progress) {
                    this.translationProgress = data.progress;
                    this.translationState = data.progress.state || 'translating';

                    if (onProgress) {
                        onProgress(this.translationProgress, this.translationState);
                    }
                }

                if (data.isComplete) {
                    break;
                }

                batchStart = data.nextBatchStart || (batchStart + batchSize);
            }

            const result = this.mergeTranslations(checkpoints, translatedCheckpoints);

            this.translationCache[cacheKey] = result;
            this.saveToPersistentCache(cacheKey, result);

            if (titlesOnly) {
                this.titlesTranslated = true;
            }

            this.translationState = 'ready';
            this.translationError = null;
            this.aiContext.setTranslationState('ready');

            if (onProgress) {
                onProgress(this.translationProgress, this.translationState);
            }

            return result;

        } catch (error) {
            this.translationState = 'error';
            this.translationError = error.message;
            this.aiContext.setTranslationState('error');

            if (onProgress) {
                onProgress(this.translationProgress, this.translationState, this.translationError);
            }

            if (translatedCheckpoints.length > 0) {
                return this.mergeTranslations(checkpoints, translatedCheckpoints);
            }

            throw error;
        }
    }

    mergeTranslations(originalCheckpoints, translatedCheckpoints) {
        const translationMap = new Map();
        const topicTranslationMap = new Map();

        translatedCheckpoints.forEach(tc => {
            if (tc.id) {
                translationMap.set(tc.id, tc);
            }
        });

        originalCheckpoints.forEach(origCp => {
            const translated = translationMap.get(origCp.id);
            if (translated && Array.isArray(origCp.topics) && Array.isArray(translated.topics)) {
                origCp.topics.forEach((origTopic, idx) => {
                    if (translated.topics[idx]) {
                        topicTranslationMap.set(origTopic, translated.topics[idx]);
                    }
                });
            }
        });

        return originalCheckpoints.map(cp => {
            const translated = translationMap.get(cp.id);
            if (translated) {
                return {
                    ...cp,
                    name: translated.name || cp.name,
                    description: translated.description || cp.description,
                    category: translated.category || cp.category,
                    topics: translated.topics || cp.topics || [],
                    translated: true
                };
            } else {
                const translatedTopics = Array.isArray(cp.topics) 
                    ? cp.topics.map(topic => topicTranslationMap.get(topic) || topic)
                    : cp.topics || [];
                    
                return { 
                    ...cp, 
                    topics: translatedTopics,
                    translated: false 
                };
            }
        });
    }

    generateCheckpointHash(checkpoints) {
        const ids = checkpoints.map(cp => cp.id).sort().join(',');
        return this.simpleHash(ids);
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    async clearCache() {
        this.translationCache = {};
        
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                localStorage.removeItem(this.STORAGE_KEYS.translationCache);
            } catch (e) {
                console.warn('[AITranslationManager] Failed to clear persistent cache:', e);
            }
        }

        const formData = new FormData();
        formData.append('action', 'crownpeak_dqm_clear_translation_cache');

        try {
            const drupalUrl = typeof Drupal !== 'undefined' && Drupal.url 
                ? Drupal.url('dqm-drupal-module/clear-translation-cache')
                : '/dqm-drupal-module/clear-translation-cache';
            
            const response = await fetch(drupalUrl, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            return data.success;
        } catch (error) {
            console.error('Failed to clear translation cache:', error);
            return false;
        }
    }

    restartTranslation() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.translationState = 'idle';
        this.translationProgress = {
            translatedCheckpoints: 0,
            totalCheckpoints: 0
        };
        this.translationError = null;
        this.checkpointTranslationStatus = {};
        this.titlesTranslated = false;
    }

    isCheckpointFullyTranslated(checkpointId) {
        return this.checkpointTranslationStatus[checkpointId] === 'full';
    }

    areTitlesTranslated() {
        return this.titlesTranslated;
    }

    getState() {
        return {
            state: this.translationState,
            progress: this.translationProgress,
            error: this.translationError
        };
    }

    getCacheStats() {
        const memoryCount = Object.keys(this.translationCache).length;
        let persistentCount = 0;
        
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                const cached = localStorage.getItem(this.STORAGE_KEYS.translationCache);
                if (cached) {
                    const data = JSON.parse(cached);
                    persistentCount = Object.keys(data).length;
                }
            } catch (e) {
                console.warn('[AITranslationManager] Failed to get cache stats:', e);
            }
        }
        
        return {
            memory: memoryCount,
            persistent: persistentCount,
            total: Math.max(memoryCount, persistentCount)
        };
    }
}

window.AITranslationManager = AITranslationManager;
