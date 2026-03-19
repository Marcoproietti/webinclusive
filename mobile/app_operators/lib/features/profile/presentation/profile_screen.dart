// lib/features/profile/presentation/profile_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/presentation/auth_provider.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Profilo')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // Avatar
        Center(child: Column(children: [
          CircleAvatar(radius: 40, backgroundColor: AppTheme.primary,
            child: Text(user?.email.substring(0,1).toUpperCase() ?? '?',
              style: const TextStyle(fontSize: 32, color: Colors.white, fontWeight: FontWeight.w700))),
          const SizedBox(height: 12),
          Text(user?.email ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          Text(user?.role ?? '', style: TextStyle(color: Colors.grey[600])),
        ])),
        const SizedBox(height: 32),
        // Opzioni
        _SettingTile(icon: Icons.lock_outline,    title: 'Cambia password',
          onTap: () {}),
        _SettingTile(icon: Icons.notifications_outlined, title: 'Notifiche',
          onTap: () {}),
        _SettingTile(icon: Icons.phone_android,   title: 'Dispositivi registrati',
          onTap: () {}),
        _SettingTile(icon: Icons.info_outline,    title: 'Informazioni app',
          onTap: () => showAboutDialog(context: context, applicationName: 'WEB.INCLUSIVE',
            applicationVersion: '1.0.0')),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout, color: Colors.red),
          title:   const Text('Esci', style: TextStyle(color: Colors.red, fontWeight: FontWeight.w600)),
          onTap:   () async {
            await ref.read(authProvider.notifier).logout();
            if (context.mounted) context.go('/login');
          },
        ),
      ]),
    );
  }
}

class _SettingTile extends StatelessWidget {
  final IconData icon; final String title; final VoidCallback onTap;
  const _SettingTile({required this.icon, required this.title, required this.onTap});
  @override
  Widget build(BuildContext context) => ListTile(
    leading:  Icon(icon, color: AppTheme.primary),
    title:    Text(title),
    trailing: const Icon(Icons.chevron_right),
    onTap:    onTap,
  );
}
