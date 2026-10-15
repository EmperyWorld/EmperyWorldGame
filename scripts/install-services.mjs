/** Install only Empery user units; build/migrate first, then explicitly start the target. */
import { writeFileSync, mkdirSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const operationsFile=join(root,'config/operations.json');
if(!existsSync(operationsFile))throw new Error('Create config/operations.json from config/operations.example.json and choose a local backup directory first');
const operations=JSON.parse(readFileSync(operationsFile,'utf8'));
if(!operations.metricsToken)operations.metricsToken=randomBytes(32).toString('hex');
writeFileSync(operationsFile,JSON.stringify(operations,null,2)+'\n',{mode:0o600});chmodSync(operationsFile,0o600);
mkdirSync(join(root,'deploy/systemd'),{recursive:true});
writeFileSync(join(root,'deploy/systemd/runtime.env'),'EMPERY_OPERATIONS_TOKEN='+operations.metricsToken+'\n',{mode:0o600});chmodSync(join(root,'deploy/systemd/runtime.env'),0o600);
const node=process.execPath;const envPath=`${node.slice(0,node.lastIndexOf('/'))}:/usr/local/bin:/usr/bin:/bin`;
const directory=join(homedir(),'.config/systemd/user');mkdirSync(directory,{recursive:true});
const installedServer=join(directory,'empery-server.service');
if(existsSync(installedServer)&&!readFileSync(installedServer,'utf8').includes(`# Managed by ${root}/`))throw new Error('Empery units belong to a different checkout; refusing to overwrite them');
const q=value=>JSON.stringify(value).replaceAll('%','%%');
const service=(description,body)=>`# Managed by ${root}/scripts/install-services.mjs\n[Unit]\nDescription=${description}\n${body.unit??''}\nOnFailure=empery-alert@%n.service\n[Service]\nWorkingDirectory=${root}\nEnvironment=PATH=${envPath}\n${body.service}\n`;
const units={
 'empery-infra.service':service('Empery PostgreSQL and Redis',{service:`Type=oneshot\nRemainAfterExit=yes\nExecStart=/usr/bin/bash ${q(root+'/scripts/start-infra.sh')}\nTimeoutStartSec=240\n`}),
 'empery-server.service':service('Empery authoritative game server',{unit:'Requires=empery-infra.service\nAfter=empery-infra.service\nPartOf=empery-game.target',service:`EnvironmentFile=${root}/deploy/systemd/runtime.env\nExecStartPre=${q(node)} ${q(root+'/apps/server/scripts/init-persistence.mjs')}\nExecStart=${q(node)} ${q(root+'/apps/server/dist/index.js')}\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=30\nKillSignal=SIGTERM\nNoNewPrivileges=yes\nLogRateLimitIntervalSec=30s\nLogRateLimitBurst=1000\n`}),
 'empery-client.service':service('Empery game client',{unit:'Requires=empery-server.service\nAfter=empery-server.service\nPartOf=empery-game.target',service:`WorkingDirectory=${root}/apps/client\nExecStart=${q(node)} ${q(root+'/apps/client/node_modules/vite/bin/vite.js')} preview --port 5180 --strictPort\nRestart=on-failure\nRestartSec=5\nNoNewPrivileges=yes\n`}),
 'empery-admin.service':service('Empery administration UI',{unit:'Requires=empery-server.service\nAfter=empery-server.service\nPartOf=empery-game.target',service:`WorkingDirectory=${root}/apps/admin\nExecStart=${q(node)} ${q(root+'/apps/admin/node_modules/vite/bin/vite.js')} preview --port 5190 --strictPort\nRestart=on-failure\nRestartSec=5\nNoNewPrivileges=yes\n`}),
 'empery-backup.service':service('Empery verified database and file backup',{unit:'After=empery-infra.service',service:`Type=oneshot\nExecStart=${q(node)} ${q(root+'/apps/server/scripts/operations.mjs')} backup\nUMask=0077\nNice=10\nIOSchedulingClass=idle\nTimeoutStartSec=30min\n`}),
 'empery-restore-check.service':service('Empery weekly isolated restore check',{unit:'After=empery-infra.service',service:`Type=oneshot\nExecStart=${q(node)} ${q(root+'/apps/server/scripts/operations.mjs')} verify-latest\nUMask=0077\nNice=10\nIOSchedulingClass=idle\nTimeoutStartSec=30min\n`}),
 'empery-restore-check.timer':`[Unit]\nDescription=Weekly Empery recovery verification\n[Timer]\nOnCalendar=Sun *-*-* 05:00:00\nPersistent=yes\nRandomizedDelaySec=10min\n[Install]\nWantedBy=timers.target\n`,
 'empery-monitor.service':service('Empery health and persistence monitor',{service:`Type=oneshot\nExecStart=${q(node)} ${q(root+'/apps/server/scripts/operations.mjs')} monitor\nUMask=0077\nTimeoutStartSec=45\n`}),
 'empery-alert@.service':service('Empery service failure notification',{service:`Type=oneshot\nExecStart=${q(node)} ${q(root+'/apps/server/scripts/operations.mjs')} alert %i\n`,unit:'OnFailure='}),
 'empery-game.target':`[Unit]\nDescription=Empery game stack\nWants=empery-server.service empery-client.service empery-admin.service\n[Install]\nWantedBy=default.target\n`,
 'empery-backup.timer':`[Unit]\nDescription=Daily Empery backups\n[Timer]\nOnCalendar=*-*-* 04:00:00\nPersistent=yes\nRandomizedDelaySec=10min\n[Install]\nWantedBy=timers.target\n`,
 'empery-monitor.timer':`[Unit]\nDescription=Empery monitoring every minute\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=1min\n[Install]\nWantedBy=timers.target\n`
};
units['empery-alert@.service']=units['empery-alert@.service'].replace('OnFailure=empery-alert@%n.service','OnFailure=');
for(const [name,content] of Object.entries(units)){
 const file=join(directory,name);
 if(existsSync(file)&&!readFileSync(file,'utf8').includes('Empery')&&!readFileSync(file,'utf8').includes(root))throw new Error(`Refusing to replace unrelated unit ${file}`);
 writeFileSync(file,content,{mode:0o644});mkdirSync(join(root,'deploy/systemd'),{recursive:true});writeFileSync(join(root,'deploy/systemd',name),content);
}
execFileSync('systemctl',['--user','daemon-reload'],{stdio:'inherit'});
execFileSync('systemctl',['--user','enable','empery-game.target','empery-backup.timer','empery-monitor.timer','empery-restore-check.timer'],{stdio:'inherit'});
console.log('Installed and enabled. Start with: systemctl --user start empery-game.target empery-backup.timer empery-monitor.timer empery-restore-check.timer');
