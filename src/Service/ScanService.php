<?php
namespace Drupal\dqm_drupal_module\Service;

use Symfony\Component\HttpFoundation\Request;

class ScanService {
  public function scanContent($api_key, $website_id, $content, $asset_id = null, $logger) {
    $method = $asset_id ? 'PUT' : 'POST';
    $endpoint = $asset_id 
      ? 'https://api.crownpeak.net/dqm-cms/v1/assets/' . $asset_id . '?apiKey=' . $api_key
      : 'https://api.crownpeak.net/dqm-cms/v1/assets?apiKey=' . $api_key;
    $form_params = [
      'content' => $content,
      'contentType' => 'text/html; charset=UTF-8',
      'websiteId' => $website_id,
    ];
    $logger->info('=== API REQUEST DETAILS ===');
    $logger->info('HTTP Method: @method', ['@method' => $method]);
    $logger->info('Endpoint: @endpoint', ['@endpoint' => $endpoint]);
    $logger->info('Form parameters: content length=@content_length, contentType=@content_type, websiteId=@website_id', [
      '@content_length' => strlen($form_params['content']),
      '@content_type' => $form_params['contentType'],
      '@website_id' => $form_params['websiteId']
    ]);
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
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_POSTFIELDS => http_build_query($form_params),
        CURLOPT_HTTPHEADER => [
          'Content-Type: application/x-www-form-urlencoded',
          'x-api-key: ' . $api_key,
        ],
      ]);
      $response = curl_exec($curl);
      $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
      $error = curl_error($curl);
      curl_close($curl);
      $logger->info('=== API RESPONSE DETAILS ===');
      $logger->info('HTTP Status Code: @http_code', ['@http_code' => $httpCode]);
      $logger->info('Response length: @response_length bytes', ['@response_length' => strlen($response)]);
      $logger->info('cURL error: @curl_error', ['@curl_error' => $error ?: 'None']);
      if ($error) {
        $logger->error('cURL error occurred: @error', ['@error' => $error]);
        return ['success' => false, 'message' => 'cURL error: ' . $error];
      }
      if ($method === 'PUT' && $httpCode === 404) {
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
          CURLOPT_POSTFIELDS => http_build_query($form_params),
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
          return ['success' => false, 'message' => 'cURL error: ' . $error];
        }
      }
      $data = json_decode($response, true);
      $logger->info('=== RESPONSE PROCESSING ===');
      $logger->info('JSON decode successful: @json_success', ['@json_success' => ($data !== null) ? 'Yes' : 'No']);
      if ($data !== null) {
        $logger->info('Response data keys: @keys', ['@keys' => implode(', ', array_keys($data))]);
        if (isset($data['assetId'])) {
          $logger->info('Asset ID in response: @asset_id', ['@asset_id' => $data['assetId']]);
        }
        if (isset($data['id'])) {
          $logger->info('ID in response: @id', ['@id' => $data['id']]);
        }
      }
      if ($httpCode >= 200 && $httpCode < 300) {
        if (isset($data['assetId']) || isset($data['id'])) {
          $asset_id = isset($data['assetId']) ? $data['assetId'] : $data['id'];
          $logger->info('Success response - Asset ID: @asset_id', ['@asset_id' => $asset_id]);
          return ['success' => true, 'assetId' => $asset_id];
        } else {
          $logger->warning('Success response but no asset ID found in response');
          return ['success' => false, 'message' => $data];
        }
      } else {
        $logger->error('HTTP error response: @code - @response', ['@code' => $httpCode, '@response' => $response]);
        return ['success' => false, 'message' => 'HTTP ' . $httpCode . ': ' . $response];
      }
    } catch (\Exception $e) {
      $logger->error('Exception during scan: @msg', ['@msg' => $e->getMessage()]);
      return ['success' => false, 'message' => $e->getMessage()];
    }
  }

  public function getResults($api_key, $assetId, $logger) {
    if (empty($assetId)) {
      return ['success' => false, 'message' => 'No asset ID provided.'];
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
        return ['success' => false, 'message' => 'cURL error: ' . $error];
      }
      if ($httpCode >= 200 && $httpCode < 300) {
        $data = json_decode($response, true);
        return ['success' => true, 'data' => $data];
      } else {
        return ['success' => false, 'message' => 'HTTP ' . $httpCode . ': ' . $response];
      }
    } catch (\Exception $e) {
      $logger->error('Exception during results fetch: @msg', ['@msg' => $e->getMessage()]);
      return ['success' => false, 'message' => $e->getMessage()];
    }
  }
}
