<?php  
namespace Drupal\crownpeak_dqm\Form;  

use Drupal\Core\Form\ConfigFormBase;  
use Drupal\Core\Form\FormStateInterface;  
use Drupal\Core\Url;
use Drupal;

class SettingsForm extends ConfigFormBase {  

  public function getFormId() {  
    return 'crownpeak_dqm_settings';  
  }  

  protected function getEditableConfigNames() {  
    return ['crownpeak_dqm.settings'];  
  }  

  public function buildForm(array $form, FormStateInterface $form_state) {  
    $config = $this->config('crownpeak_dqm.settings');  

    $form['module_description'] = [
      '#markup' => '<div class="description" style="margin-bottom:20px; font-size:1.1em; color:#555;">A Drupal Module for Crownpeak Digital Quality & Accessibility Management.</div>',
    ];

    $form['api_key'] = [  
      '#type' => 'textfield',  
      '#title' => $this->t('DQM CMS API Key'),  
      '#default_value' => $config->get('api_key'),  
      '#required' => TRUE,  
      '#description' => $this->t('Your Crownpeak DQM CMS API Key. Contact support@crownpeak.com if you do not have this.'),  
      '#placeholder' => $this->t('Enter your DQM API key'),
    ];  

    $form['website_id'] = [  
      '#type' => 'textfield',  
      '#title' => $this->t('Website ID'),  
      '#default_value' => $config->get('website_id'),  
      '#required' => TRUE,  
      '#description' => $this->t('Your DQM Website ID. If you are unsure what this is, please contact support@crownpeak.com.'),  
      '#placeholder' => $this->t('Enter your Website ID'),
    ];
    
    $form['#attached']['html_head'][] = [
      [
        '#tag' => 'style',
        '#value' => '
          .form-submit.crownpeak-dqm-save-button {
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
          .form-submit.crownpeak-dqm-save-button:hover {
            background: #9a039d !important;
            border-color: #9a039d !important;
          }
        ',
      ],
      'crownpeak-dqm-settings-style'
    ];
    
    $form = parent::buildForm($form, $form_state);

    if (isset($form['actions']['submit'])) {
      $form['actions']['submit']['#attributes']['class'][] = 'crownpeak-dqm-save-button';
    }
    
    return $form;
  }  

  public function submitForm(array &$form, FormStateInterface $form_state) {  
    $api_key = $form_state->getValue('api_key');
    $website_id = $form_state->getValue('website_id');
    
    $this->config('crownpeak_dqm.settings')  
      ->set('api_key', $api_key)  
      ->set('website_id', $website_id)  
      ->save();  

    parent::submitForm($form, $form_state);  
  }  
}