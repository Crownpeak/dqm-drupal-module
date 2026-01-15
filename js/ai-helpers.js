
window.DQM_AI_Helpers = {

    isGPT5Model(model) {
        return model && model.startsWith('gpt-5');
    },

    getModelCapabilities(model) {
        const capabilities = {
            supportsReasoningEffort: this.isGPT5Model(model),
            maxTokens: model === 'gpt-4o-mini' ? 16384 : 128000,
            costTier: model.includes('mini') ? 'low' : model.includes('4o') ? 'medium' : 'high',
            recommended: model === 'gpt-4o-mini'
        };
        return capabilities;
    },

    formatTranslationProgress(progress) {
        const { translatedCheckpoints, totalCheckpoints } = progress;
        const percentage = totalCheckpoints > 0 
            ? Math.round((translatedCheckpoints / totalCheckpoints) * 100) 
            : 0;
        return {
            text: `${translatedCheckpoints} / ${totalCheckpoints}`,
            percentage: percentage
        };
    },

    getTranslationStateLabel(state, t = (s) => s) {
        const labels = {
            idle: t('Ready'),
            initializing: t('Initializing...'),
            translating: t('Translating...'),
            ready: t('Translation complete'),
            partial: t('Partial translation (some failed)'),
            error: t('Translation failed')
        };
        return labels[state] || state;
    },

    getTranslationStateColor(state) {
        const colors = {
            idle: '#6b7280',
            initializing: '#3b82f6',
            translating: '#3b82f6',
            ready: '#10b981',
            partial: '#f59e0b',
            error: '#ef4444'
        };
        return colors[state] || '#6b7280';
    },

    createTranslationProgressHTML(progress, state, error, t = (s) => s) {
        if (state === 'idle' || !progress) {
            return '';
        }

        const { text, percentage } = this.formatTranslationProgress(progress);
        const stateLabel = this.getTranslationStateLabel(state, t);
        const color = this.getTranslationStateColor(state);

        let html = `
            <div class="dqm-translation-progress" data-state="${state}">
                <div class="dqm-translation-status" style="color: ${color};">
                    <strong>${stateLabel}</strong>
                </div>
        `;

        if (state === 'translating' || state === 'initializing') {
            html += `
                <div class="dqm-progress-bar">
                    <div class="dqm-progress-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="dqm-progress-text">${text}</div>
            `;
        }

        if (error) {
            html += `
                <div class="dqm-translation-error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    ${error}
                </div>
            `;
        }

        html += `</div>`;
        return html;
    },

    validateOpenAIConfig(config) {
        const errors = [];

        if (!config.apiKey || config.apiKey.length < 10) {
            errors.push('Invalid or missing API key');
        }

        if (!config.model) {
            errors.push('No model selected');
        }

        if (!config.baseUrl || !config.baseUrl.startsWith('http')) {
            errors.push('Invalid base URL');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    },

    getLanguageName(code) {
        const languages = {
            en: 'English',
            de: 'German (Deutsch)',
            es: 'Spanish (Español)',
            fr: 'French (Français)',
            it: 'Italian (Italiano)',
            pt: 'Portuguese (Português)',
            nl: 'Dutch (Nederlands)',
            ja: 'Japanese (日本語)',
            zh: 'Chinese (中文)',
            ko: 'Korean (한국어)',
            ru: 'Russian (Русский)',
            ar: 'Arabic (العربية)',
            hi: 'Hindi (हिन्दी)'
        };
        return languages[code] || code.toUpperCase();
    },

    estimateTranslationTime(checkpointCount, mode = 'fast') {
        const timePerCheckpoint = mode === 'fast' ? 0.5 : 1.5;
        const batchSize = 10;
        const batches = Math.ceil(checkpointCount / batchSize);
        const estimatedSeconds = batches * timePerCheckpoint;

        if (estimatedSeconds < 60) {
            return `~${Math.ceil(estimatedSeconds)} seconds`;
        } else {
            const minutes = Math.ceil(estimatedSeconds / 60);
            return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
        }
    },

    formatAPIError(error, t = (s) => s) {
        if (!error) return '';

        const errorString = error.toString().toLowerCase();

        if (errorString.includes('network')) {
            return t('Network error. Please check your connection.');
        }
        if (errorString.includes('timeout')) {
            return t('Request timed out. Please try again.');
        }
        if (errorString.includes('401') || errorString.includes('unauthorized')) {
            return t('Invalid API key. Please check your OpenAI API key.');
        }
        if (errorString.includes('429') || errorString.includes('rate limit')) {
            return t('Rate limit exceeded. Please wait and try again.');
        }
        if (errorString.includes('500') || errorString.includes('502') || errorString.includes('503')) {
            return t('OpenAI service error. Please try again later.');
        }

        return error.message || error.toString();
    },

    createAlert(type, message, icon = null) {
        const icons = {
            info: 'fa-circle-info',
            success: 'fa-circle-check',
            warning: 'fa-triangle-exclamation',
            error: 'fa-circle-exclamation'
        };

        const colors = {
            info: '#3b82f6',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444'
        };

        const iconClass = icon || icons[type] || icons.info;
        const color = colors[type] || colors.info;

        return `
            <div class="dqm-alert dqm-alert-${type}" style="border-left-color: ${color};">
                <i class="fa-solid ${iconClass}" style="color: ${color};"></i>
                <span>${message}</span>
            </div>
        `;
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    isTranslationNeeded(sourceLang, targetLang) {
        if (!targetLang || targetLang === 'en') return false;
        if (sourceLang === targetLang) return false;
        return true;
    },

    getCheckpointStats(checkpoints) {
        const total = checkpoints.length;
        const failed = checkpoints.filter(cp => cp.failed === true).length;
        const passed = total - failed;
        const failureRate = total > 0 ? Math.round((failed / total) * 100) : 0;

        return {
            total,
            failed,
            passed,
            failureRate,
            hasFailures: failed > 0
        };
    }
};
