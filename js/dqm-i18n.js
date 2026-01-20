(function(window) {
    'use strict';
    const LANGUAGE_FILES = {
        en: 'languages/en.json',
        de: 'languages/de.json',
        es: 'languages/es.json'
    };
    const loadedTranslations = {};
    let currentLocale = 'en';
    async function loadLanguageFile(locale) {
        if (loadedTranslations[locale]) {
            return loadedTranslations[locale];
        }
        const filePath = LANGUAGE_FILES[locale];
        if (!filePath) {
            return null;
        }
        try {
            const settings = typeof Drupal !== 'undefined' && Drupal.settings?.dqmDrupalModule 
                ? Drupal.settings.dqmDrupalModule 
                : (typeof drupalSettings !== 'undefined' && drupalSettings?.dqmDrupalModule 
                    ? drupalSettings.dqmDrupalModule 
                    : {});
            const modulePath = settings.modulePath || '/modules/custom/dqm-drupal-module/';
            const response = await fetch(modulePath + filePath);
            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            const translations = await response.json();
            loadedTranslations[locale] = translations;
            return translations;
        } catch (error) {
            return null;
        }
    }
    async function initializeTranslations(locale) {
        locale = locale || 'en';
        currentLocale = locale;
        await loadLanguageFile(locale);
        if (locale !== 'en') {
            await loadLanguageFile('en');
        }
    }
    function getTranslation(key, locale) {
        locale = locale || currentLocale;
        const translations = loadedTranslations[locale];
        if (translations && translations[key]) {
            return translations[key];
        }
        if (locale !== 'en') {
            const fallbackTranslations = loadedTranslations['en'];
            if (fallbackTranslations && fallbackTranslations[key]) {
                return fallbackTranslations[key];
            }
        }
        return key;
    }
    function getEnglishKey(translatedValue) {
        if (!translatedValue) return translatedValue;
        if (currentLocale === 'en') return translatedValue;
        const translations = loadedTranslations[currentLocale];
        if (!translations) return translatedValue;
        const key = Object.keys(translations).find(k => translations[k] === translatedValue);
        return key || translatedValue;
    }
    function setCurrentLocale(locale) {
        currentLocale = locale;
    }
    function getCurrentLocale() {
        return currentLocale;
    }
    function getAvailableLocales() {
        return Object.keys(LANGUAGE_FILES);
    }
    window.DQM_I18N = {
        en: null,
        de: null,
        es: null,
        loadLanguageFile: loadLanguageFile,
        initializeTranslations: initializeTranslations,
        loadLanguageFile: loadLanguageFile,
        initializeTranslations: initializeTranslations,
        getTranslation: getTranslation,
        getEnglishKey: getEnglishKey,
        setCurrentLocale: setCurrentLocale,
        getCurrentLocale: getCurrentLocale,
        getAvailableLocales: getAvailableLocales,
        get loaded() {
            return loadedTranslations;
        }
    };
    Object.defineProperty(window.DQM_I18N, 'en', {
        get: function() {
            return loadedTranslations.en || {};
        },
        enumerable: true
    });
    Object.defineProperty(window.DQM_I18N, 'de', {
        get: function() {
            return loadedTranslations.de || {};
        },
        enumerable: true
    });
    Object.defineProperty(window.DQM_I18N, 'es', {
        get: function() {
            return loadedTranslations.es || {};
        },
        enumerable: true
    });
})(window);
