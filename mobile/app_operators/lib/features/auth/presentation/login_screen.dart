// lib/features/auth/presentation/login_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey    = GlobalKey<FormState>();
  final _emailCtrl  = TextEditingController();
  final _passCtrl   = TextEditingController();
  bool  _obscure    = true;
  String? _error;

  @override
  void dispose() { _emailCtrl.dispose(); _passCtrl.dispose(); super.dispose(); }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _error = null);
    await ref.read(authProvider.notifier).login(
      _emailCtrl.text.trim(),
      _passCtrl.text,
    );
    final err = ref.read(authProvider).error;
    if (err != null && mounted) {
      setState(() => _error = _mapError(err.toString()));
    }
  }

  String _mapError(String e) {
    if (e.contains('INVALID_CREDENTIALS')) return 'Email o password non corretti.';
    if (e.contains('USER_INACTIVE'))        return 'Account disabilitato.';
    if (e.contains('TOO_MANY_REQUESTS'))    return 'Troppi tentativi. Riprova tra 15 minuti.';
    if (e.contains('SocketException'))      return 'Nessuna connessione internet.';
    return 'Errore di accesso. Riprova.';
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(authProvider).isLoading;
    final colors    = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: colors.primary,
      body: SafeArea(
        child: Column(children: [
          // Header
          Expanded(
            flex: 2,
            child: Center(child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.health_and_safety_rounded, size: 64, color: Colors.white),
                const SizedBox(height: 12),
                const Text('WEB.INCLUSIVE',
                  style: TextStyle(color: Colors.white, fontSize: 28,
                    fontWeight: FontWeight.w800, letterSpacing: 1)),
                const SizedBox(height: 4),
                Text('Operatori ADI',
                  style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 14)),
              ],
            )),
          ),
          // Form card
          Expanded(
            flex: 3,
            child: Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
              ),
              padding: const EdgeInsets.all(28),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('Accedi', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 24),

                    // Email
                    TextFormField(
                      controller:   _emailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText:   'Email aziendale',
                        prefixIcon:  Icon(Icons.email_outlined),
                      ),
                      validator: (v) =>
                        v == null || v.isEmpty ? 'Inserisci email' :
                        !v.contains('@')       ? 'Email non valida' : null,
                    ),
                    const SizedBox(height: 16),

                    // Password
                    TextFormField(
                      controller:  _passCtrl,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText:   'Password',
                        prefixIcon:  const Icon(Icons.lock_outlined),
                        suffixIcon:  IconButton(
                          icon: Icon(_obscure ? Icons.visibility : Icons.visibility_off),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) =>
                        v == null || v.isEmpty ? 'Inserisci password' : null,
                    ),

                    // Errore
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color:        Colors.red[50],
                          borderRadius: BorderRadius.circular(8),
                          border:       Border.all(color: Colors.red[200]!),
                        ),
                        child: Row(children: [
                          const Icon(Icons.error_outline, color: Colors.red, size: 18),
                          const SizedBox(width: 8),
                          Expanded(child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13))),
                        ]),
                      ),
                    ],

                    const Spacer(),

                    // Submit
                    ElevatedButton(
                      onPressed: isLoading ? null : _submit,
                      child: isLoading
                        ? const SizedBox(height: 20, width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Accedi'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
