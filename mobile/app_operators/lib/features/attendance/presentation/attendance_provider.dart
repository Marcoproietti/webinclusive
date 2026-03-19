// lib/features/attendance/presentation/attendance_provider.dart
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../../core/api/api_client.dart';

sealed class AttendanceState {
  const AttendanceState();
}
class AttendanceIdle     extends AttendanceState { const AttendanceIdle(); }
class AttendanceCheckedIn extends AttendanceState {
  final String attendanceId;
  final bool verified, geofenceOk;
  final int? distanceMeters;
  final bool offline;
  const AttendanceCheckedIn({required this.attendanceId, required this.verified,
    required this.geofenceOk, this.distanceMeters, this.offline = false});
}
class AttendanceCheckedOut extends AttendanceState {
  final int durationMin;
  const AttendanceCheckedOut({required this.durationMin});
}
class AttendanceNoteAdded extends AttendanceState { const AttendanceNoteAdded(); }

class AttendanceNotifier extends AutoDisposeAsyncNotifier<AttendanceState> {
  @override
  Future<AttendanceState> build() async => const AttendanceIdle();

  // ── Check-in ──────────────────────────────────────────
  Future<void> checkIn(String appointmentId) async {
    state = const AsyncLoading();
    try {
      // 1. GPS
      final pos = await _getPosition();

      // 2. Device ID + secret
      final storage  = ref.read(secureStorageProvider);
      final deviceId = await storage.read(key: 'device_id') ?? 'default-device';
      final secret   = await storage.read(key: 'device_secret') ?? '';

      // 3. Timestamp UTC
      final now = DateTime.now().toUtc().toIso8601String();

      // 4. Firma HMAC-SHA256
      final sig = _sign(
        appointmentId: appointmentId,
        operatorId:    '', // verrà letto dal JWT lato server
        lat:           pos.latitude, lng: pos.longitude,
        timestamp:     now, type: 'checkin', secret: secret,
      );

      // 5. Invio
      final dio = ref.read(apiClientProvider);
      final res = await dio.post('/api/v1/attendance/checkin', data: {
        'appointment_id':   appointmentId,
        'lat':              pos.latitude,
        'lng':              pos.longitude,
        'device_signature': sig,
        'client_timestamp': now,
        'device_id':        deviceId,
      });
      final d = res.data as Map<String, dynamic>;
      state = AsyncData(AttendanceCheckedIn(
        attendanceId:  d['attendance_id'] as String,
        verified:      d['is_verified'] as bool,
        geofenceOk:    d['geofence_ok'] as bool,
        distanceMeters:d['distance_meters'] as int?,
        offline:       false,
      ));
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  // ── Check-out ─────────────────────────────────────────
  Future<void> checkOut(String attendanceId) async {
    state = const AsyncLoading();
    try {
      final pos     = await _getPosition();
      final storage = ref.read(secureStorageProvider);
      final deviceId = await storage.read(key: 'device_id') ?? 'default-device';
      final secret   = await storage.read(key: 'device_secret') ?? '';
      final now      = DateTime.now().toUtc().toIso8601String();

      final sig = _sign(
        appointmentId: attendanceId, operatorId: '',
        lat: pos.latitude, lng: pos.longitude,
        timestamp: now, type: 'checkout', secret: secret,
      );

      final dio = ref.read(apiClientProvider);
      final res = await dio.post('/api/v1/attendance/$attendanceId/checkout', data: {
        'lat': pos.latitude, 'lng': pos.longitude,
        'device_signature': sig, 'client_timestamp': now, 'device_id': deviceId,
      });
      final d = res.data as Map<String, dynamic>;
      state = AsyncData(AttendanceCheckedOut(durationMin: d['duration_min'] as int));
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  // ── Nota post-visita ──────────────────────────────────
  Future<void> submitNote({
    required String attendanceId,
    required String noteText,
    Map<String, dynamic>? vitalSigns,
    int? painScale,
    List<String> alerts = const [],
  }) async {
    state = const AsyncLoading();
    try {
      final dio = ref.read(apiClientProvider);
      await dio.post('/api/v1/attendance/$attendanceId/note', data: {
        'note_text':   noteText,
        'vital_signs': vitalSigns,
        'pain_scale':  painScale,
        'alerts':      alerts,
      });
      state = const AsyncData(AttendanceNoteAdded());
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  // ── Helpers ───────────────────────────────────────────
  Future<Position> _getPosition() async {
    final perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      await Geolocator.requestPermission();
    }
    return Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
      timeLimit:       const Duration(seconds: 10),
    );
  }

  String _sign({
    required String appointmentId, required String operatorId,
    required double lat, required double lng,
    required String timestamp, required String type, required String secret,
  }) {
    final payload = [
      appointmentId, operatorId,
      lat.toStringAsFixed(6), lng.toStringAsFixed(6),
      timestamp, type,
    ].join('|');
    final key  = utf8.encode(secret);
    final msg  = utf8.encode(payload);
    final hmac = Hmac(sha256, key);
    return hmac.convert(msg).toString();
  }
}

final attendanceProvider =
  AsyncNotifierProvider.autoDispose<AttendanceNotifier, AttendanceState>(
    AttendanceNotifier.new);
