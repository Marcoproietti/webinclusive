// lib/features/auth/presentation/auth_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';

class AuthUser {
  final String id;
  final String email;
  final String role;
  const AuthUser({required this.id, required this.email, required this.role});
  factory AuthUser.fromJson(Map<String, dynamic> j) =>
      AuthUser(id: j['id'] as String, email: j['email'] as String, role: j['role'] as String);
}

class AuthNotifier extends AsyncNotifier<AuthUser?> {
  @override
  Future<AuthUser?> build() async {
    final storage = ref.read(secureStorageProvider);
    final token   = await storage.read(key: 'access_token');
    if (token == null) return null;
    // Verifica token ancora valido
    try {
      final dio = ref.read(apiClientProvider);
      final res = await dio.get('/api/v1/users/me');
      return AuthUser.fromJson(res.data as Map<String, dynamic>);
    } catch (_) {
      await storage.delete(key: 'access_token');
      return null;
    }
  }

  Future<void> login(String email, String password) async {
    state = const AsyncLoading();
    try {
      final dio     = ref.read(apiClientProvider);
      final storage = ref.read(secureStorageProvider);
      final res = await dio.post('/api/v1/auth/login',
        data: {'email': email, 'password': password});
      final data  = res.data as Map<String, dynamic>;
      if (data['mfa_required'] == true) {
        throw Exception('MFA_REQUIRED:${data["user_id"]}');
      }
      await storage.write(key: 'access_token', value: data['access_token'] as String);
      final user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);
      state = AsyncData(user);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> logout() async {
    try {
      final dio = ref.read(apiClientProvider);
      await dio.post('/api/v1/auth/logout');
    } finally {
      final storage = ref.read(secureStorageProvider);
      await storage.deleteAll();
      state = const AsyncData(null);
    }
  }
}

final authProvider = AsyncNotifierProvider<AuthNotifier, AuthUser?>(AuthNotifier.new);
