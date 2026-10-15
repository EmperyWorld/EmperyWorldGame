import { describe, expect, it, vi } from 'vitest';
import { createUiBridge, type UiBridgeDeps } from './ui-bridge.js';

describe('dialogue mount prerequisite', () => {
  it('does not open a dialogue if dismounting fails or the character changes', async () => {
    const show=vi.fn(),ensureDismounted=vi.fn().mockResolvedValue(false);
    const bridge=createUiBridge({dialogue:{show},ensureDismounted} as unknown as UiBridgeDeps);
    await bridge.showDialogue('town_captain');
    expect(show).not.toHaveBeenCalled();
  });
  it('opens the requested dialogue only after dismount completion', async () => {
    let finish!: (value:boolean)=>void;
    const show=vi.fn(),pending=new Promise<boolean>(resolve=>{finish=resolve;});
    const bridge=createUiBridge({dialogue:{show},ensureDismounted:()=>pending} as unknown as UiBridgeDeps);
    const opening=bridge.showDialogue('town_captain');
    expect(show).not.toHaveBeenCalled();finish(true);await opening;
    expect(show).toHaveBeenCalledWith('town_captain','proximity');
  });
  it('opens only the latest selected NPC even if an older dismount completes later',async()=>{
    let firstDone!:(value:boolean)=>void,secondDone!:(value:boolean)=>void;
    const first=new Promise<boolean>(r=>{firstDone=r;}),second=new Promise<boolean>(r=>{secondDone=r;});
    const show=vi.fn(),ensureDismounted=vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const bridge=createUiBridge({dialogue:{show},ensureDismounted} as unknown as UiBridgeDeps);
    const a=bridge.showDialogue('town_captain'),b=bridge.showDialogue('town_guard');
    secondDone(true);await b;firstDone(true);await a;
    expect(show).toHaveBeenCalledTimes(1);expect(show).toHaveBeenCalledWith('town_guard','proximity');
  });
  it('does not dismount for a radio conversation',async()=>{
    const show=vi.fn(),ensureDismounted=vi.fn();
    const bridge=createUiBridge({dialogue:{show},ensureDismounted} as unknown as UiBridgeDeps);
    await bridge.showDialogue('town_captain','radio');
    expect(ensureDismounted).not.toHaveBeenCalled();expect(show).toHaveBeenCalledWith('town_captain','radio');
  });
  it('does not let an older nearby conversation replace a newer radio call',async()=>{
    let done!:(value:boolean)=>void;const pending=new Promise<boolean>(r=>{done=r;});
    const show=vi.fn(),ensureDismounted=vi.fn().mockReturnValue(pending);
    const bridge=createUiBridge({dialogue:{show},ensureDismounted} as unknown as UiBridgeDeps);
    const nearby=bridge.showDialogue('town_guard');await bridge.showDialogue('town_captain','radio');done(true);await nearby;
    expect(show).toHaveBeenCalledTimes(1);expect(show).toHaveBeenCalledWith('town_captain','radio');
  });

});
