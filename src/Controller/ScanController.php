<?php
namespace Drupal\crownpeak_dqm\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;

class ScanController extends ControllerBase {
  private function debugLog($msg) {
    $logfile = DRUPAL_ROOT . '/modules/custom/crownpeak_dqm_debug.log';
    if (is_array($msg) || is_object($msg)) {
      $msg = print_r($msg, true);
    }
    file_put_contents($logfile, date('c') . ' ' . $msg . "\n", FILE_APPEND);
  }

  public function scan(Request $request) {
    $logger = \Drupal::logger('crownpeak_dqm');
    $config = \Drupal::config('crownpeak_dqm.settings');
    $api_key = $config->get('api_key');
    $website_id = $config->get('website_id');
    $content = $request->request->get('content');
    $asset_id = $request->request->get('assetId'); // Get existing asset ID if provided
    
    $logger->info('Scan requested. Website ID: @website_id, API Key: @api_key, Asset ID: @asset_id', [
      '@website_id' => $website_id, 
      '@api_key' => $api_key,
      '@asset_id' => $asset_id
    ]);
    
    if (empty($content)) {
      $logger->error('No content provided for scan.');
      return new JsonResponse(['success' => false, 'message' => 'No content provided.']);
    }

    // Determine method and endpoint based on whether we have an existing asset ID
    $method = $asset_id ? 'PUT' : 'POST';
    $endpoint = $asset_id 
      ? 'https://api.crownpeak.net/dqm-cms/v1/assets/' . $asset_id . '?apiKey=' . $api_key
      : 'https://api.crownpeak.net/dqm-cms/v1/assets?apiKey=' . $api_key;
    $form_params = [
      'content' => $content,
      'contentType' => 'text/html; charset=UTF-8',
      'websiteId' => $website_id,
    ];
    try {
      // Try using cURL directly to exactly match the working command
      $curl = curl_init();
      
      curl_setopt_array($curl, [
        CURLOPT_URL => $endpoint,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_POSTFIELDS => http_build_query([
          'content' => $content,
          'contentType' => 'text/html; charset=UTF-8',
          'websiteId' => $website_id,
        ]),
        CURLOPT_HTTPHEADER => [
          'Content-Type: application/x-www-form-urlencoded',
          'x-api-key: ' . $api_key,
        ],
      ]);
      
      $response = curl_exec($curl);
      $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
      $error = curl_error($curl);
      
      curl_close($curl);
      
      if ($error) {
        return new JsonResponse(['success' => false, 'message' => 'cURL error: ' . $error]);
      }
      
      if ($method === 'PUT' && $httpCode === 404) {
        $this->debugLog('Asset not found for PUT, trying POST instead');
        $endpoint_post = 'https://api.crownpeak.net/dqm-cms/v1/assets?apiKey=' . $api_key;
        
        $curl = curl_init();
        curl_setopt_array($curl, [
          CURLOPT_URL => $endpoint_post,
          CURLOPT_RETURNTRANSFER => true,
          CURLOPT_ENCODING => '',
          CURLOPT_MAXREDIRS => 10,
          CURLOPT_TIMEOUT => 30,
          CURLOPT_FOLLOWLOCATION => true,
          CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
          CURLOPT_CUSTOMREQUEST => 'POST',
          CURLOPT_POSTFIELDS => http_build_query([
            'content' => $content,
            'contentType' => 'text/html; charset=UTF-8',
            'websiteId' => $website_id,
          ]),
          CURLOPT_HTTPHEADER => [
            'Content-Type: application/x-www-form-urlencoded',
            'x-api-key: ' . $api_key,
          ],
        ]);
        
        $response = curl_exec($curl);
        $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        
        if ($error) {
          return new JsonResponse(['success' => false, 'message' => 'cURL error: ' . $error]);
        }
      }
      
      $data = json_decode($response, true);
      
      if ($httpCode >= 200 && $httpCode < 300) {
        if (isset($data['assetId']) || isset($data['id'])) {
          $asset_id = isset($data['assetId']) ? $data['assetId'] : $data['id'];
          return new JsonResponse(['success' => true, 'assetId' => $asset_id]);
        } else {
          return new JsonResponse(['success' => false, 'message' => $data]);
        }
      } else {
        return new JsonResponse(['success' => false, 'message' => 'HTTP ' . $httpCode . ': ' . $response]);
      }
    } catch (\Exception $e) {
      $logger->error('Exception during scan: @msg', ['@msg' => $e->getMessage()]);
      return new JsonResponse(['success' => false, 'message' => $e->getMessage()]);
    }
  }

  public function getResults($assetId) {
    $logger = \Drupal::logger('crownpeak_dqm');
    $config = \Drupal::config('crownpeak_dqm.settings');
    $api_key = $config->get('api_key');
    
    if (empty($assetId)) {
      return new JsonResponse(['success' => false, 'message' => 'No asset ID provided.']);
    }
    
    $endpoint = 'https://api.crownpeak.net/dqm-cms/v1/assets/' . $assetId . '/status?apiKey=' . $api_key . '&visibility=public';
    
    try {
      $curl = curl_init();
      
      curl_setopt_array($curl, [
        CURLOPT_URL => $endpoint,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => 'GET',
        CURLOPT_HTTPHEADER => [
          'x-api-key: ' . $api_key,
        ],
      ]);
      
      $response = curl_exec($curl);
      $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
      $error = curl_error($curl);
      
      curl_close($curl);
      
      if ($error) {
        return new JsonResponse(['success' => false, 'message' => 'cURL error: ' . $error]);
      }
      
      if ($httpCode >= 200 && $httpCode < 300) {
        $data = json_decode($response, true);
        return new JsonResponse(['success' => true, 'data' => $data]);
      } else {
        return new JsonResponse(['success' => false, 'message' => 'HTTP ' . $httpCode . ': ' . $response]);
      }
    } catch (\Exception $e) {
      $logger->error('Exception during results fetch: @msg', ['@msg' => $e->getMessage()]);
      return new JsonResponse(['success' => false, 'message' => $e->getMessage()]);
    }
  }
}