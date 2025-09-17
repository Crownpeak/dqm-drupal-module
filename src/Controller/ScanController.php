<?php
namespace Drupal\dqm_drupal_module\Controller;


use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Drupal\dqm_drupal_module\Service\ScanService;


class ScanController extends ControllerBase {
  protected $scanService;

  public function __construct(ScanService $scanService) {
    $this->scanService = $scanService;
  }

  /**
   * AJAX endpoint to fetch error highlight HTML for a specific error.
   */
  public function getErrorHighlight($assetId, $errorId) {
    $logger = \Drupal::logger('dqm_drupal_module');
    $config = \Drupal::config('dqm_drupal_module.settings');
    $api_key = $config->get('api_key');
    try {
      $result = $this->scanService->getErrorHighlight($api_key, $assetId, $errorId, $logger);
      if ($result && isset($result['success']) && $result['success']) {
        return new JsonResponse(['success' => true, 'html' => $result['html']]);
      } else {
        $msg = isset($result['message']) ? $result['message'] : 'Unknown error';
        return new JsonResponse(['success' => false, 'message' => $msg]);
      }
    } catch (\Exception $e) {
      $logger->error('Exception in getErrorHighlight: @msg', ['@msg' => $e->getMessage()]);
      return new JsonResponse(['success' => false, 'message' => $e->getMessage()]);
    }
  }

  public static function create($container) {
    return new static(
      $container->get('dqm_drupal_module.scan_service')
    );
  }

  public function scan(Request $request) {
    $logger = \Drupal::logger('dqm_drupal_module');
    try {
      $config = \Drupal::config('dqm_drupal_module.settings');
      $api_key = $config->get('api_key');
      $website_id = $config->get('website_id');
      $content = $request->request->get('content');
      $asset_id = $request->request->get('assetId');
      if (empty($content)) {
        $logger->error('No content provided for scan.');
        return new JsonResponse(['success' => false, 'message' => 'No content provided.'], 400);
      }
      if (empty($api_key) || empty($website_id)) {
        $logger->error('Missing API key or website ID in config.');
        return new JsonResponse(['success' => false, 'message' => 'Missing API key or website ID in config.'], 500);
      }
      $result = $this->scanService->scanContent($api_key, $website_id, $content, $logger, $asset_id);
      return new JsonResponse($result);
    } catch (\Exception $e) {
      $logger->error('Exception in scan(): @msg', ['@msg' => $e->getMessage()]);
      return new JsonResponse([
        'success' => false,
        'message' => 'Server error: ' . $e->getMessage(),
        'trace' => method_exists($e, 'getTraceAsString') ? $e->getTraceAsString() : null
      ], 500);
    }
  }

  public function getResults($assetId) {
    $logger = \Drupal::logger('dqm_drupal_module');
    $config = \Drupal::config('dqm_drupal_module.settings');
    $api_key = $config->get('api_key');
    $result = $this->scanService->getResults($api_key, $assetId, $logger);
    return new JsonResponse($result);
  }


  public function scanFromUrl(Request $request) {
    $logger = \Drupal::logger('dqm_drupal_module');
    $config = \Drupal::config('dqm_drupal_module.settings');
    $api_key = $config->get('api_key');
    $website_id = $config->get('website_id');
    $url = $request->request->get('url');
    $asset_id = $request->request->get('assetId');
    $clean_content = $request->request->get('cleanContent', true);
    if (empty($url)) {
      $logger->error('No URL provided for scanFromUrl.');
      throw new HttpException(400, 'No URL provided.');
    }
    $logger->info('=== URL-BASED CONTENT SCANNING ===');
    $logger->info('URL to scan: @url', ['@url' => $url]);
    $logger->info('Clean content: @clean', ['@clean' => $clean_content ? 'Yes' : 'No']);
    $logger->info('Asset ID: @asset_id', ['@asset_id' => $asset_id ?? 'None']);
    try {
      $content = $this->fetchUrlContent($url, $clean_content);
      if (empty($content)) {
        $logger->error('Could not fetch content from URL: @url', ['@url' => $url]);
        throw new HttpException(400, 'Could not fetch content from URL.');
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

  private function fetchUrlContent($url, $cleanContent = true) {
    $logger = \Drupal::logger('dqm_drupal_module');
    if (strpos($url, '/node/preview/') !== false || strpos($url, '/preview/') !== false) {
      return $this->fetchPreviewContent($url, $cleanContent);
    }
    $context = stream_context_create([
      'http' => [
        'timeout' => 30,
        'user_agent' => 'DQM Scanner/1.0',
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

  private function fetchPreviewContent($url, $cleanContent = true) {
    $logger = \Drupal::logger('dqm_drupal_module');
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

  private function cleanHtmlContent($html) {
    $logger = \Drupal::logger('dqm_drupal_module');
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
      '//div[contains(@class, "dqm-drupal-module")]',
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