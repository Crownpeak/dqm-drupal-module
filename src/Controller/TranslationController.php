<?php

namespace Drupal\dqm_drupal_module\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\Core\Config\ConfigFactoryInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\RequestException;

class TranslationController extends ControllerBase
{

  protected $httpClient;

  protected $configFactory;

  public function __construct(ClientInterface $http_client, ConfigFactoryInterface $config_factory)
  {
    $this->httpClient = $http_client;
    $this->configFactory = $config_factory;
  }

  public static function create(ContainerInterface $container)
  {
    return new static(
      $container->get('http_client'),
      $container->get('config.factory')
    );
  }

  public function translateCheckpoints(Request $request) {
    $config = $this->configFactory->get('dqm_drupal_module.settings');
    $openai_api_key = $config->get('openai_api_key');
    $openai_model = $config->get('openai_model') ?: 'gpt-4o-mini';
    $openai_base_url = $config->get('openai_base_url') ?: 'https://api.openai.com/v1';
    $reasoning_effort = $config->get('reasoning_effort') ?: 'medium';
    $translation_mode = $request->request->get('translationMode') ?: 'fast';

    $checkpoints_json = $request->request->get('checkpoints');
    $target_lang = $request->request->get('targetLang') ?: 'en';
    $batch_start = (int)$request->request->get('batchStart', 0);
    $batch_size = (int)$request->request->get('batchSize', 10);
    $titles_only = $request->request->get('titlesOnly') === '1';

    if (empty($openai_api_key) || strlen($openai_api_key) < 10) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'OpenAI API key is missing or invalid.',
        'state' => 'error',
      ]);
    }

    if (empty($checkpoints_json)) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'No checkpoints data provided.',
        'state' => 'error',
      ]);
    }

    $checkpoints = json_decode($checkpoints_json, TRUE);
    if (!is_array($checkpoints)) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'Invalid checkpoints data format.',
        'state' => 'error',
      ]);
    }

    $batch_checkpoints = array_slice($checkpoints, $batch_start, $batch_size);
    $total_checkpoints = count($checkpoints);

    if (empty($batch_checkpoints)) {
      return new JsonResponse([
        'success' => TRUE,
        'translatedCheckpoints' => [],
        'progress' => [
          'translatedCheckpoints' => $batch_start,
          'totalCheckpoints' => $total_checkpoints,
          'state' => 'ready',
        ],
      ]);
    }

    $language_names = [
      'en' => 'English',
      'de' => 'German (Deutsch)',
      'es' => 'Spanish (Español)',
      'fr' => 'French (Français)',
      'it' => 'Italian (Italiano)',
      'pt' => 'Portuguese (Português)',
      'nl' => 'Dutch (Nederlands)',
      'ja' => 'Japanese (日本語)',
      'zh' => 'Chinese (中文)',
    ];

    $language_name = $language_names[$target_lang] ?? 'English';

    if ($titles_only) {
      $system_prompt = sprintf(
        'You are a fast translator. Translate ONLY name, category, and topics to %s (%s). Skip description field. Keep translations concise and natural. Return JSON only.',
        $language_name,
        $target_lang
      );
    } elseif ($translation_mode === 'full') {
      $system_prompt = sprintf(
        'You are a professional translator. Translate ALL text fields (name, description, category, topics) to %s (%s). CRITICAL: ALL text fields MUST be translated to the target language. Maintain technical accuracy, preserve HTML tags if present, and ensure translations are natural and idiomatic. Return JSON only with translated fields.',
        $language_name,
        $target_lang
      );
    } else {
      $system_prompt = sprintf(
        'You are a fast translator. Quickly translate all text fields (name, description, category, topics) to %s (%s). Keep it concise. CRITICAL: ALL fields must be in the target language. Return JSON only.',
        $language_name,
        $target_lang
      );
    }

    $checkpoint_data = [];
    foreach ($batch_checkpoints as $idx => $cp) {
      $item = [
        'id' => $cp['id'] ?? $idx,
        'name' => $cp['name'] ?? '',
        'category' => $cp['category'] ?? '',
        'topics' => $cp['topics'] ?? [],
        'failed' => $cp['failed'] ?? FALSE,
      ];

      if (!$titles_only) {
        $item['description'] = $cp['description'] ?? '';
      }

      $checkpoint_data[] = $item;
    }

    if ($titles_only) {
      $user_prompt = sprintf(
        "Translate checkpoint names and categories to %s (skip description):\n%s\n\nReturn JSON array with same structure but with 'name' and 'category' translated to %s. Leave 'description' empty or omit it.\nCRITICAL: Do NOT translate the 'topics' array. Keep 'topics' values exactly as they are in English (e.g. 'Accessibility', 'SEO'). Preserve 'id' and 'failed' unchanged.",
        $language_name,
        json_encode($checkpoint_data, JSON_PRETTY_PRINT),
        $language_name
      );
    } else {
      $user_prompt = sprintf(
        "Translate these checkpoints to %s:\n%s\n\nReturn JSON array with same structure but with 'name', 'description', and 'category' fully translated to %s.\nCRITICAL: Do NOT translate the 'topics' array. Keep 'topics' values exactly as they are in English (e.g. 'Accessibility', 'SEO'). Preserve the 'id' and 'failed' fields unchanged. Each checkpoint must have translated name, description, category, and original English topics array.",
        $language_name,
        json_encode($checkpoint_data, JSON_PRETTY_PRINT),
        $language_name
      );
    }

    $endpoint = rtrim($openai_base_url, '/') . '/chat/completions';

    $messages = [
      ['role' => 'system', 'content' => $system_prompt],
      ['role' => 'user', 'content' => $user_prompt],
    ];

    $body_data = [
      'model' => $openai_model,
      'messages' => $messages,
      'response_format' => ['type' => 'json_object'],
      'max_completion_tokens' => $titles_only ? 1024 : 2048,
    ];

    $is_reasoning_model = strpos($openai_model, 'o1-') === 0 || strpos($openai_model, 'o3-') === 0 || strpos($openai_model, 'gpt-5') === 0;
    if (!$is_reasoning_model) {
      $body_data['temperature'] = 0.3; 
    }

    if (strpos($openai_model, 'gpt-5') === 0) {
      $body_data['reasoning_effort'] = $reasoning_effort;
    }

    try {
      $response = $this->httpClient->post($endpoint, [
        'headers' => [
          'Content-Type' => 'application/json',
          'Authorization' => 'Bearer ' . $openai_api_key,
        ],
        'json' => $body_data,
        'timeout' => 90,
      ]);

      $status_code = $response->getStatusCode();
      $body = $response->getBody()->getContents();
      $data = json_decode($body, TRUE);

      if ($status_code !== 200) {
        $error_message = $data['error']['message'] ?? 'Unknown error';
        return new JsonResponse([
          'success' => FALSE,
          'message' => 'Translation API error: ' . $error_message,
          'state' => 'partial',
          'translatedCheckpoints' => [],
          'progress' => [
            'translatedCheckpoints' => $batch_start,
            'totalCheckpoints' => $total_checkpoints,
            'state' => 'partial',
          ],
        ]);
      }

      if (!isset($data['choices'][0]['message']['content'])) {
        return new JsonResponse([
          'success' => FALSE,
          'message' => 'Invalid response from translation API.',
          'state' => 'error',
          'progress' => [
            'translatedCheckpoints' => $batch_start,
            'totalCheckpoints' => $total_checkpoints,
            'state' => 'error',
          ],
        ]);
      }

      $translation_text = trim($data['choices'][0]['message']['content']);

      if (preg_match('/```json\s*(.+?)\s*```/s', $translation_text, $matches)) {
        $translation_text = $matches[1];
      } elseif (preg_match('/```\s*(.+?)\s*```/s', $translation_text, $matches)) {
        $translation_text = $matches[1];
      } else {
        if (preg_match('/\[.+\]/s', $translation_text, $matches)) {
            $translation_text = $matches[0];
        }
      }

      $translation_text = trim($translation_text);
      $translated_data = json_decode($translation_text, TRUE);

      if (is_array($translated_data) && isset($translated_data['checkpoints']) && is_array($translated_data['checkpoints'])) {
          $translated_data = $translated_data['checkpoints'];
      }
      
      if (is_array($translated_data) && isset($translated_data['translatedCheckpoints']) && is_array($translated_data['translatedCheckpoints'])) {
          $translated_data = $translated_data['translatedCheckpoints'];
      }

      if (json_last_error() !== JSON_ERROR_NONE || !is_array($translated_data)) {
        return new JsonResponse([
          'success' => FALSE,
          'message' => 'Failed to parse translation response. JSON Error: ' . json_last_error_msg(),
          'state' => 'partial',
          'translatedCheckpoints' => [],
          'progress' => [
            'translatedCheckpoints' => $batch_start,
            'totalCheckpoints' => $total_checkpoints,
            'state' => 'partial',
          ],
        ]);
      }

      $new_batch_start = $batch_start + count($batch_checkpoints);
      $is_complete = $new_batch_start >= $total_checkpoints;

      return new JsonResponse([
        'success' => TRUE,
        'translatedCheckpoints' => $translated_data,
        'progress' => [
          'translatedCheckpoints' => $new_batch_start,
          'totalCheckpoints' => $total_checkpoints,
          'state' => $is_complete ? 'ready' : 'translating',
        ],
        'isComplete' => $is_complete,
        'nextBatchStart' => $is_complete ? NULL : $new_batch_start,
      ]);

    } catch (RequestException $e) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'Translation request failed: ' . $e->getMessage(),
        'state' => 'error',
        'progress' => [
          'translatedCheckpoints' => $batch_start,
          'totalCheckpoints' => $total_checkpoints,
          'state' => 'error',
        ],
      ]);
    }
  }

  public function clearTranslationCache()
  {
    return new JsonResponse([
      'success' => TRUE,
      'message' => 'Translation cache cleared successfully.',
    ]);
  }

}
