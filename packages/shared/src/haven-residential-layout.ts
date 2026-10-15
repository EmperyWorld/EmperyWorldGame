import { HAVEN_RESIDENTIAL_COURT } from './haven-coords.js';

const { x, y } = HAVEN_RESIDENTIAL_COURT;
/** Physical courtyard scenery must match on the server and every graphics preset. */
export const HAVEN_RESIDENTIAL_COURT_PROPS: ReadonlyArray<readonly [string, number, number, number]> = [
  ['prop_basketball_court', x, y, HAVEN_RESIDENTIAL_COURT.size],
];
