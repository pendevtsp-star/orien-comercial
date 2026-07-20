# Backup and Restore

## Politica inicial

- Backup diario no MVP.
- Retencao minima de 7 dias no MVP controlado.
- Criptografia do arquivo de backup.
- Armazenamento fora da VPS quando possivel.
- Teste de restore mensal.
- Registro de cada execução, checksum, destino externo e resultado de restauração.
- Retenção recomendada: 30 dias fora da VPS, com acesso limitado a operador de backup.

## Restore

1. Parar aplicacao.
2. Validar arquivo e checksum.
3. Restaurar em banco novo.
4. Rodar smoke tests.
5. Reapontar aplicacao.
6. Registrar incidente e tempo de recuperacao.

## Verificação descartável

O script `ops/verify-backup-restore.sh` restaura em banco temporário com prefixo `orien_restore_check_`. Nunca aponte uma restauração de teste para o banco de produção.

Antes de operar backup externo, conclua os passos em `docs/DEPENDENCIAS_DO_PROPRIETARIO.md`.
