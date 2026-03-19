// lib/core/services/sync_service.dart
import 'package:workmanager/workmanager.dart';

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, _) async {
    if (task == 'syncOfflineQueue') {
      // Sync logic qui — chiama API /attendance/sync con record in coda SQLite
      // Implementazione completa con Drift DAO nella versione estesa
      return true;
    }
    return true;
  });
}

class SyncService {
  static Future<void> initialize() async {
    await Workmanager().initialize(callbackDispatcher, isInDebugMode: false);
    await Workmanager().registerPeriodicTask(
      'sync-offline-queue',
      'syncOfflineQueue',
      frequency:   const Duration(minutes: 15),
      constraints: Constraints(networkType: NetworkType.connected),
    );
  }
}

// lib/core/services/push_service.dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class PushService {
  static final _local = FlutterLocalNotificationsPlugin();

  static Future<void> initialize() async {
    // Configura notifiche locali
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios     = DarwinInitializationSettings(requestAlertPermission: true);
    await _local.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );

    // FCM
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);

    // Handler messaggi in foreground
    FirebaseMessaging.onMessage.listen((msg) {
      final n = msg.notification;
      if (n == null) return;
      _local.show(
        n.hashCode,
        n.title,
        n.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'wi_channel', 'WEB.INCLUSIVE',
            importance: Importance.high, priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(),
        ),
      );
    });
  }

  static Future<String?> getToken() async =>
    FirebaseMessaging.instance.getToken();
}
