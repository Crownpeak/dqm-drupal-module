<?php  
namespace Drupal\dqm_drupal_module\Form;  

use Drupal\Core\Form\ConfigFormBase;  
use Drupal\Core\Form\FormStateInterface;  
use Drupal\Core\Url;
use Drupal;

class SettingsForm extends ConfigFormBase {  

  public function getFormId() {  
    return 'dqm_drupal_module_settings';  
  }  

  protected function getEditableConfigNames() {  
    return ['dqm_drupal_module.settings'];  
  }  

  public function buildForm(array $form, FormStateInterface $form_state) {  
    $config = $this->config('dqm_drupal_module.settings');  

    $form['module_description'] = [
      '#markup' => '<p class="description" style="margin-bottom:20px; font-size:1.1em; color:#555;">A Drupal Module for Digital Quality & Accessibility Management.</p>',
    ];
    $form['api_key'] = [  
      '#type' => 'textfield',  
      '#title' => $this->t('DQM CMS API Key'),  
      '#default_value' => $config->get('api_key'),  
      '#required' => TRUE,  
      '#description' => $this->t('Your DQM CMS API Key. Contact support if you do not have this.'),  
      '#placeholder' => $this->t('Enter your DQM API key'),
    ];  

    $form['website_id'] = [  
      '#type' => 'textfield',  
      '#title' => $this->t('Website ID'),  
      '#default_value' => $config->get('website_id'),  
      '#required' => TRUE,  
      '#description' => $this->t('Your DQM Website ID. If you are unsure what this is, please contact support.'),  
      '#placeholder' => $this->t('Enter your Website ID'),
    ];

    // AI Assistant Configuration section.
    $form['ai_section'] = [
      '#type' => 'details',
      '#title' => $this->t('AI Assistant Configuration'),
      '#description' => $this->t('Configure OpenAI API settings for translation and summary features.'),
      '#open' => FALSE,
    ];

    $form['ai_section']['openai_api_key'] = [
      '#type' => 'password',
      '#title' => $this->t('OpenAI API Key'),
      '#description' => $this->t('Your OpenAI API key is required for AI features. Get one at https://platform.openai.com/api-keys. Leave blank to keep existing key.'),
      '#placeholder' => $config->get('openai_api_key') ? '••••••••••••••••' : $this->t('Enter your OpenAI API key (sk-...)'),
      '#attributes' => [
        'autocomplete' => 'off',
      ],
    ];

    $form['ai_section']['openai_base_url'] = [
      '#type' => 'textfield',
      '#title' => $this->t('OpenAI Base URL'),
      '#default_value' => $config->get('openai_base_url') ?: 'https://api.openai.com/v1',
      '#description' => $this->t('OpenAI-compatible API base URL. Use default for OpenAI or custom for proxies.'),
      '#placeholder' => 'https://api.openai.com/v1',
    ];

    $form['ai_section']['openai_model'] = [
      '#type' => 'select',
      '#title' => $this->t('OpenAI Model'),
      '#default_value' => $config->get('openai_model') ?: 'gpt-4o-mini',
      '#options' => [
        'gpt-5.2' => $this->t('gpt-5.2 🆕'),
        'gpt-4o-mini' => $this->t('gpt-4o-mini (Recommended)'),
        'gpt-4o' => $this->t('gpt-4o'),
        'gpt-4.1-mini' => $this->t('gpt-4.1-mini'),
        'gpt-4.1' => $this->t('gpt-4.1'),
      ],
      '#description' => $this->t('Choose the OpenAI model for AI features. gpt-4o-mini offers the best balance of cost and quality.'),
    ];

    $form['ai_section']['reasoning_effort'] = [
      '#type' => 'select',
      '#title' => $this->t('🧠 Reasoning Effort (GPT-5 only)'),
      '#default_value' => $config->get('reasoning_effort') ?: 'medium',
      '#options' => [
        'low' => $this->t('Fast - Quick responses, lower cost'),
        'medium' => $this->t('Balanced - Good quality and speed'),
        'high' => $this->t('Thorough - Best quality, slower'),
      ],
      '#description' => $this->t('Controls how thoroughly GPT-5 analyzes content. Only applies to GPT-5 models.'),
      '#states' => [
        'visible' => [
          ':input[name="openai_model"]' => ['value' => 'gpt-5.2'],
        ],
      ],
    ];
    
    
    $form['#attached']['html_head'][] = [
      [
        '#tag' => 'style',
        '#value' => '
          .form-submit.dqm-drupal-module-save-button {
            background: #b604d4 !important;
            border-color: #b604d4 !important;
            color: white !important;
            padding: 12px 24px !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            border-radius: 4px !important;
            transition: all 0.2s ease !important;
            text-decoration: none !important;
            cursor: pointer !important;
            border: 1px solid transparent !important;
          }
          .form-submit.dqm-drupal-module-save-button:hover {
            background: #9a039d !important;
            border-color: #9a039d !important;
          }
        ',
      ],
      'dqm-drupal-module-settings-style'
    ];
    
    $form = parent::buildForm($form, $form_state);

    if (isset($form['actions']['submit'])) {
      $form['actions']['submit']['#attributes']['class'][] = 'dqm-drupal-module-save-button';
    }
    
    return $form;
  }  

  public function submitForm(array &$form, FormStateInterface $form_state) {  
    $api_key = $form_state->getValue('api_key');
    $website_id = $form_state->getValue('website_id');
    $openai_api_key = $form_state->getValue('openai_api_key');
    $openai_model = $form_state->getValue('openai_model');
    $openai_base_url = $form_state->getValue('openai_base_url');
    $reasoning_effort = $form_state->getValue('reasoning_effort');
    
    try {
      $config = $this->config('dqm_drupal_module.settings');
      $config->set('api_key', $api_key)
        ->set('website_id', $website_id)
        ->set('openai_model', $openai_model)
        ->set('openai_base_url', $openai_base_url)
        ->set('reasoning_effort', $reasoning_effort);
      
      // Only update OpenAI API key if a new value was provided
      if (!empty($openai_api_key)) {
        $config->set('openai_api_key', $openai_api_key);
      }
      
      $config->save();
    } catch (\Exception $e) {
      \Drupal::messenger()->addError($this->t('Failed to save settings: @message', ['@message' => $e->getMessage()]));
      return;
    }
    parent::submitForm($form, $form_state);
  }

}