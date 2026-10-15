import { beforeEach, describe, expect, it, vi } from 'vitest';
const focus=vi.hoisted(()=>({chat:false,typing:false}));
vi.mock('../../chat-ui.js',()=>({isChatFocused:()=>focus.chat}));
vi.mock('../../hotkeys.js',()=>({isTypingTarget:()=>focus.typing}));
vi.mock('./gamepad-input.js',()=>({gamepadInput:{getAxis:()=>({x:0,y:0}),consume:()=>false}}));
import { InputManager } from './InputManager.js';
beforeEach(()=>{focus.chat=false;focus.typing=false;});
describe('movement key ownership',()=>{
  it('blocks input after blur and requires a fresh key press after focus returns', () => {
    const input=new InputManager();
    input['onKeyDown']({code:'KeyW',repeat:false} as KeyboardEvent);
    const epoch=input.movementEpoch;input['onBlur']();
    expect(input.isUiBlocked()).toBe(true);expect(input.movementEpoch).toBe(epoch+1);
    input['onKeyDown']({code:'ShiftLeft',repeat:false} as KeyboardEvent);input['onFocus']();
    expect(input.getMoveAxis()).toEqual({x:0,y:0});expect(input.consumeDash()).toBe(false);
    input['onKeyDown']({code:'KeyD',repeat:false} as KeyboardEvent);expect(input.getMoveAxis()).toEqual({x:1,y:0});
  });
  it.each(['chat','typing'] as const)('does not buffer movement or dash keys entered in %s',kind=>{
    const input=new InputManager();focus[kind]=true;
    input['onKeyDown']({code:'KeyW',repeat:false} as KeyboardEvent);
    input['onKeyDown']({code:'ShiftLeft',repeat:false} as KeyboardEvent);
    focus[kind]=false;
    expect(input.getMoveAxis()).toEqual({x:0,y:0});expect(input.consumeDash()).toBe(false);
    input['onKeyDown']({code:'KeyW',repeat:false} as KeyboardEvent);
    input['onKeyDown']({code:'ShiftLeft',repeat:false} as KeyboardEvent);
    expect(input.getMoveAxis()).toEqual({x:0,y:-1});expect(input.consumeDash()).toBe(true);
  });
});
