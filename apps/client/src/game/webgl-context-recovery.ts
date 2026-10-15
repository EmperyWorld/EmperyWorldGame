import Phaser from 'phaser';

/**
 * Do not preventDefault on contextlost — that blocks WebGL restore.
 * Phaser 4 restores when it can; if the context stays gone, recreate the Game.
 */
export function bindWebGlContextRecovery(game: Phaser.Game, onLost: () => void): void {
  const canvas = game.canvas;
  if (!canvas) return;
  let fired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fail = (): void => {
    if (fired) return;
    fired = true;
    onLost();
  };

  const onLostEvent = (): void => {
    timer = setTimeout(fail, 2000);
  };

  const onRestored = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  canvas.addEventListener('webglcontextlost', onLostEvent);
  canvas.addEventListener('webglcontextrestored', onRestored);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    if (timer !== undefined) clearTimeout(timer);
    canvas.removeEventListener('webglcontextlost', onLostEvent);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  });
}
