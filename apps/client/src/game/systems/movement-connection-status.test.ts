// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { MovementConnectionStatus } from './movement-connection-status.js';
afterEach(()=>{document.body.innerHTML='';});
describe('movement connection notice',()=>{
  it('appears only after a sustained pause, updates on reconnect and clears on readiness',()=>{
    document.body.innerHTML='<div id="gameplay-shell"></div>';
    const status=new MovementConnectionStatus();status.update('waiting',0);status.update('waiting',749);
    expect(document.querySelector('[role="status"]')).toBeNull();
    status.update('waiting',750);const element=document.querySelector('[role="status"]') as HTMLElement;
    expect(element.textContent).toContain('Ожидание сервера');expect(element.hidden).toBe(false);
    status.update('connecting',800);expect(element.textContent).toContain('Восстанавливаем');
    status.update('ready',900);expect(element.hidden).toBe(true);
    status.update('waiting',1000);status.update('travel',1800);expect(element.hidden).toBe(true);
    status.destroy();expect(document.querySelector('[role="status"]')).toBeNull();
  });
});
