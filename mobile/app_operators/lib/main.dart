// ─────────────────────────────────────────────────────────
// lib/main.dart — WEB.INCLUSIVE App Operatori
// ─────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/services/push_service.dart';
import 'core/services/sync_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase (push notifications)
  await Firebase.initializeApp();

  // Orientamento verticale
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Background sync worker
  await SyncService.initialize();

  runApp(const ProviderScope(child: WiOperatorsApp()));
}

class WiOperatorsApp extends ConsumerWidget {
  const WiOperatorsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title:            'WEB.INCLUSIVE',
      debugShowCheckedModeBanner: false,
      theme:            AppTheme.light,
      darkTheme:        AppTheme.dark,
      themeMode:        ThemeMode.system,
      routerConfig:     router,
      localizationsDelegates: const [
        // Aggiungi localizzazioni se necessario
      ],
    );
  }
}
