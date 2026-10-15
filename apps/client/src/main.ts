import { bootApp } from './boot-app.js';
import { registerMediaServiceWorker } from './sw-register.js';

registerMediaServiceWorker();
bootApp();
