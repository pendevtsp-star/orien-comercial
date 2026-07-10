# Backup and Restore

## Politica inicial

- Backup diario no MVP.
- Retencao minima de 7 dias no MVP controlado.
- Criptografia do arquivo de backup.
- Armazenamento fora da VPS quando possivel.
- Teste de restore mensal.

## Restore

1. Parar aplicacao.
2. Validar arquivo e checksum.
3. Restaurar em banco novo.
4. Rodar smoke tests.
5. Reapontar aplicacao.
6. Registrar incidente e tempo de recuperacao.
