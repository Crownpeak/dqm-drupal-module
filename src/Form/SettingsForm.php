<?php  
namespace Drupal\crownpeak_dqm\Form;  

use Drupal\Core\Form\ConfigFormBase;  
use Drupal\Core\Form\FormStateInterface;  

class SettingsForm extends ConfigFormBase {  

  public function getFormId() {  
    return 'crownpeak_dqm_settings';  
  }  

  protected function getEditableConfigNames() {  
    return ['crownpeak_dqm.settings'];  
  }  

  public function buildForm(array $form, FormStateInterface $form_state) {  
    $config = $this->config('crownpeak_dqm.settings');  

    $form['api_key'] = [  
      '#type' => 'textfield',  
      '#title' => $this->t('API Key'),  
      '#default_value' => $config->get('api_key'),  
      '#required' => TRUE,  
      '#description' => $this->t('Your Crownpeak DQM API key.'),  
    ];  

    $form['website_id'] = [  
      '#type' => 'textfield',  
      '#title' => $this->t('Website ID'),  
      '#default_value' => $config->get('website_id'),  
      '#required' => TRUE,  
      '#description' => $this->t('Your Crownpeak DQM Website ID.'),  
    ];  

    return parent::buildForm($form, $form_state);  
  }  

  public function submitForm(array &$form, FormStateInterface $form_state) {  
    $this->config('crownpeak_dqm.settings')  
      ->set('api_key', $form_state->getValue('api_key'))  
      ->set('website_id', $form_state->getValue('website_id'))  
      ->save();  

    parent::submitForm($form, $form_state);  
  }  
}  