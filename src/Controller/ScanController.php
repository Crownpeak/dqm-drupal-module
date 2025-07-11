<?php
namespace Drupal\crownpeak_dqm\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;

class ScanController extends ControllerBase {
  private function debugLog($msg) {
    $logfile = DRUPAL_ROOT . '/modules/custom/dqm-drupal-module/crownpeak_dqm_debug.log';
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
    $asset_id = $request->request->get('assetId');
    $content_length = strlen($content ?? '');
    $content_preview = $content ? substr(strip_tags($content), 0, 200) . '...' : 'No content';
    $logger->info('=== CONTENT SUBMISSION DETAILS ===');
    $logger->info('Scan requested. Website ID: @website_id, API Key length: @api_key_length, Asset ID: @asset_id', [
      '@website_id' => $website_id, 
      '@api_key_length' => strlen($api_key ?? ''),
      '@asset_id' => $asset_id ?? 'None'
    ]);
    $logger->info('Content details - Length: @content_length bytes, Preview: @content_preview', [
      '@content_length' => $content_length,
      '@content_preview' => $content_preview
    ]);
    $user_agent = $request->headers->get('User-Agent', 'Not provided');
    $content_type = $request->headers->get('Content-Type', 'Not provided');
    $logger->info('Request headers - User-Agent: @user_agent, Content-Type: @content_type', [
      '@user_agent' => substr($user_agent, 0, 100),
      '@content_type' => $content_type
    ]);
    if (empty($content)) {
      $logger->error('No content provided for scan.');
      return new JsonResponse(['success' => false, 'message' => 'No content provided.']);
    }
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
      $logger->info('=== API RESPONSE DETAILS ===');
      $logger->info('HTTP Status Code: @http_code', ['@http_code' => $httpCode]);
      $logger->info('Response length: @response_length bytes', ['@response_length' => strlen($response)]);
      $logger->info('cURL error: @curl_error', ['@curl_error' => $error ?: 'None']);
      if ($error) {
        $logger->error('cURL error occurred: @error', ['@error' => $error]);
        return new JsonResponse(['success' => false, 'message' => 'cURL error: ' . $error]);
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
          return new JsonResponse(['success' => true, 'assetId' => $asset_id]);
        } else {
          $logger->warning('Success response but no asset ID found in response');
          return new JsonResponse(['success' => false, 'message' => $data]);
        }
      } else {
        $logger->error('HTTP error response: @code - @response', ['@code' => $httpCode, '@response' => $response]);
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

  /**
   * Clear debug logs.
   */
  public function clearDebugLogs() {
    $message = crownpeak_dqm_clear_debug_logs();
    \Drupal::messenger()->addStatus($message);
    return $this->redirect('crownpeak_dqm.debug_logs');
  }

  /**
   * Scan content from a preview URL or any URL by fetching its rendered content.
   */
  public function scanFromUrl(Request $request) {
    $logger = \Drupal::logger('crownpeak_dqm');
    $config = \Drupal::config('crownpeak_dqm.settings');
    $api_key = $config->get('api_key');
    $website_id = $config->get('website_id');
    $url = $request->request->get('url');
    $asset_id = $request->request->get('assetId');
    $clean_content = $request->request->get('cleanContent', true);
    if (empty($url)) {
      return new JsonResponse(['success' => false, 'message' => 'No URL provided.']);
    }
    $logger->info('=== URL-BASED CONTENT SCANNING ===');
    $logger->info('URL to scan: @url', ['@url' => $url]);
    $logger->info('Clean content: @clean', ['@clean' => $clean_content ? 'Yes' : 'No']);
    $logger->info('Asset ID: @asset_id', ['@asset_id' => $asset_id ?? 'None']);
    try {
      $content = $this->fetchUrlContent($url, $clean_content);
      if (empty($content)) {
        return new JsonResponse(['success' => false, 'message' => 'Could not fetch content from URL.']);
      }
      $request->request->set('content', $content);
      if ($asset_id) {
        $request->request->set('assetId', $asset_id);
      }
      return $this->scan($request);
    } catch (\Exception $e) {
      $logger->error('Exception during URL scan: @msg', ['@msg' => $e->getMessage()]);
      return new JsonResponse(['success' => false, 'message' => $e->getMessage()]);
    }
  }

  /**
   * Fetch and clean content from a URL.
   */
  private function fetchUrlContent($url, $cleanContent = true) {
    $logger = \Drupal::logger('crownpeak_dqm');
    if (strpos($url, '/node/preview/') !== false || strpos($url, '/preview/') !== false) {
      return $this->fetchPreviewContent($url, $cleanContent);
    }
    $context = stream_context_create([
      'http' => [
        'timeout' => 30,
        'user_agent' => 'Crownpeak DQM Scanner/1.0',
        'follow_location' => true,
        'max_redirects' => 5,
      ]
    ]);
    $content = @file_get_contents($url, false, $context);
    if ($content === false) {
      $logger->error('Failed to fetch content from URL: @url', ['@url' => $url]);
      return false;
    }
    $logger->info('Fetched content from URL, length: @length bytes', ['@length' => strlen($content)]);
    if ($cleanContent) {
      $content = $this->cleanHtmlContent($content);
    }
    return $content;
  }

  /**
   * Fetch content from a preview URL by rendering the node.
   */
  private function fetchPreviewContent($url, $cleanContent = true) {
    $logger = \Drupal::logger('crownpeak_dqm');
    if (preg_match('/\/node\/preview\/([a-f0-9-]+)\//', $url, $matches)) {
      $uuid = $matches[1];
      $nodes = \Drupal::entityTypeManager()
        ->getStorage('node')
        ->loadByProperties(['uuid' => $uuid]);
      if (empty($nodes)) {
        $logger->error('Node not found for UUID: @uuid', ['@uuid' => $uuid]);
        return false;
      }
      $node = reset($nodes);
      $view_builder = \Drupal::entityTypeManager()->getViewBuilder('node');
      $render_array = $view_builder->view($node, 'full');
      $renderer = \Drupal::service('renderer');
      $html = $renderer->renderPlain($render_array);
      $logger->info('Rendered preview content for node @id, length: @length bytes', [
        '@id' => $node->id(),
        '@length' => strlen($html)
      ]);
      if ($cleanContent) {
        $title = $node->getTitle();
        $lang = \Drupal::languageManager()->getCurrentLanguage()->getId();
        $fullHtml = '<!DOCTYPE html>' . "\n" .
          '<html lang="' . $lang . '">' . "\n" .
          '<head>' . "\n" .
          '<meta charset="UTF-8">' . "\n" .
          '<meta name="viewport" content="width=device-width, initial-scale=1.0">' . "\n" .
          '<title>' . htmlspecialchars($title) . '</title>' . "\n" .
          '</head>' . "\n" .
          '<body>' . "\n" .
          $html . "\n" .
          '</body>' . "\n" .
          '</html>';
        return $fullHtml;
      }
      return $html;
    }
    $logger->error('Could not extract UUID from preview URL: @url', ['@url' => $url]);
    return false;
  }

  /**
   * Clean HTML content by removing admin elements and scripts.
   */
  private function cleanHtmlContent($html) {
    $logger = \Drupal::logger('crownpeak_dqm');
    $dom = new \DOMDocument('1.0', 'UTF-8');
    $dom->preserveWhiteSpace = false;
    $dom->formatOutput = true;
    libxml_use_internal_errors(true);
    if (!$dom->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD)) {
      $logger->warning('Could not parse HTML for cleaning');
      return $html;
    }
    libxml_clear_errors();
    $xpath = new \DOMXPath($dom);
    $adminQueries = [
      '//div[contains(@class, "toolbar")]',
      '//div[contains(@class, "admin-toolbar")]',
      '//div[contains(@class, "contextual")]',
      '//div[contains(@class, "local-tasks")]',
      '//div[contains(@class, "local-actions")]',
      '//div[contains(@class, "messages")]',
      '//div[contains(@class, "breadcrumb")]',
      '//div[contains(@class, "tabs")]',
      '//div[contains(@class, "form-actions")]',
      '//div[contains(@class, "crownpeak-dqm")]',
      '//script',
      '//noscript',
      '//div[contains(@class, "visually-hidden")]',
      '//div[contains(@class, "sr-only")]',
      '//div[contains(@style, "display: none")]',
      '//div[contains(@style, "display:none")]',
    ];
    $removedCount = 0;
    foreach ($adminQueries as $query) {
      $elements = $xpath->query($query);
      foreach ($elements as $element) {
        if ($element->parentNode) {
          $element->parentNode->removeChild($element);
          $removedCount++;
        }
      }
    }
    $logger->info('Cleaned HTML: removed @count admin elements', ['@count' => $removedCount]);
    return $dom->saveHTML();
  }
}