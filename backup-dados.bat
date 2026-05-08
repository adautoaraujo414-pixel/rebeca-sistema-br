@echo off
title Backup Rebeca Delivery
echo Fazendo backup dos dados...
set DATA=%date:~6,4%-%date:~3,2%-%date:~0,2%
docker exec rebeca-mongo mongodump --out /backup/%DATA%
docker cp rebeca-mongo:/backup/%DATA% ./backup-%DATA%
echo Backup salvo em: backup-%DATA%
pause
