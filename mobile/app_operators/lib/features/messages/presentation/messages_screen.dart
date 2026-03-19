// lib/features/attendance/presentation/checkout_screen.dart
export 'checkin_screen.dart';

// lib/features/attendance/presentation/note_screen.dart
// (già incluso in checkin_screen.dart come NoteScreen)

// lib/features/messages/presentation/messages_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/theme/app_theme.dart';

class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});
  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  final _ctrl = TextEditingController();
  List<Map<String, dynamic>> _msgs = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final dio = ref.read(apiClientProvider);
      final res = await dio.get('/api/v1/messages');
      setState(() { _msgs = List<Map<String,dynamic>>.from(res.data['data'] as List); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    _ctrl.clear();
    try {
      final dio = ref.read(apiClientProvider);
      await dio.post('/api/v1/messages', data: {
        'channel': 'operator_co', 'body': text,
      });
      _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Messaggi CO')),
    body: _loading
      ? const Center(child: CircularProgressIndicator())
      : Column(children: [
          Expanded(child: _msgs.isEmpty
            ? const Center(child: Text('Nessun messaggio'))
            : ListView.builder(
                reverse: true,
                padding: const EdgeInsets.all(12),
                itemCount: _msgs.length,
                itemBuilder: (ctx, i) {
                  final m = _msgs[i];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: const Icon(Icons.message, color: AppTheme.primary),
                      title:   Text(m['body'] as String? ?? ''),
                      subtitle:Text(m['sentAt'] as String? ?? ''),
                    ),
                  );
                },
              ),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 4)],
            ),
            child: Row(children: [
              Expanded(child: TextField(
                controller: _ctrl,
                decoration: const InputDecoration(hintText: 'Scrivi alla CO...'),
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
              )),
              const SizedBox(width: 8),
              IconButton(
                icon: const Icon(Icons.send, color: AppTheme.primary),
                onPressed: _send,
              ),
            ]),
          ),
        ]),
  );
}
