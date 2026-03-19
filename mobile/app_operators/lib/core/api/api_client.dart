// lib/core/api/api_client.dart
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

const _baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://app.webinclusive.it',
);

const _storage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
  iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
);

// ── JWT Refresh Interceptor ─────────────────────────────

class AuthInterceptor extends Interceptor {
  final Dio _dio;
  bool _isRefreshing = false;

  AuthInterceptor(this._dio);

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _storage.read(key: 'access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401 && !_isRefreshing) {
      _isRefreshing = true;
      try {
        // Prova refresh — il cookie HttpOnly viene inviato automaticamente
        final res = await _dio.post('/api/v1/auth/refresh');
        final newToken = res.data['access_token'] as String;
        await _storage.write(key: 'access_token', value: newToken);

        // Ripete la richiesta originale
        err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
        final retry = await _dio.fetch(err.requestOptions);
        handler.resolve(retry);
        return;
      } catch (_) {
        // Refresh fallito → logout
        await _storage.deleteAll();
        handler.reject(err);
      } finally {
        _isRefreshing = false;
      }
    } else {
      handler.next(err);
    }
  }
}

// ── Singleton Dio ───────────────────────────────────────

Dio _buildDio() {
  final dio = Dio(BaseOptions(
    baseUrl:        _baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 30),
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
  ));

  dio.interceptors.addAll([
    AuthInterceptor(dio),
    LogInterceptor(
      requestBody:  false,
      responseBody: false,
      error:        true,
    ),
  ]);

  return dio;
}

final _dioInstance = _buildDio();

// ── Provider ────────────────────────────────────────────

final apiClientProvider = Provider<Dio>((_) => _dioInstance);
final secureStorageProvider = Provider<FlutterSecureStorage>((_) => _storage);
