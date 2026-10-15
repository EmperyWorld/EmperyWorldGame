import {
  HAVEN_SHIP_HEADINGS,
  havenShipHeadingAssetId,
  type HavenShipHeading,
} from '@empery/shared';
import type { MediaAssetSpec } from './catalog.js';

type ShipHullSpec = {
  id: string;
  label: string;
  hull: string;
};

const SAIL_ONLY =
  'canvas sails only, unmarked blank weathered wooden hull, empty transom, no painted letters, no words, no numbers, no nameplate, no inscription, no text anywhere, no oars, no oar banks, no paddles, no crew';

/** Only appended on IDs we force-regen this pass (caravel set + N/S/unsuffixed). */
const PAINTED_SPRITE =
  'hand-painted 2D RPG prop sprite, matte oil-paint illustration, visible brushwork, game tileset asset, not a glossy 3D toy, not a photoreal museum model, not studio CGI';

const HULLS: readonly ShipHullSpec[] = [
  {
    id: 'prop_ship_brig',
    label: 'Navy brig',
    hull: 'two-masted navy brig only, square sails on exactly two masts, dark oak hull with gold trim and gunports, compact warship not a three-masted ship of the line',
  },
  {
    id: 'prop_ship_cog',
    label: 'Merchant cog',
    hull: 'medieval Hanseatic merchant cog, one mast with a huge square sail, high forecastle and sterncastle, clinker oak hull, fat trading sailing ship',
  },
  {
    id: 'prop_ship_ferry',
    label: 'Passenger ferry',
    hull: 'medieval wooden passenger sailing packet, one mast with gaff and jib, small deckhouse and railings, open deck benches, not a modern yacht, not a motorboat',
  },
  {
    id: 'prop_ship_barge',
    label: 'Cargo barge',
    hull: 'wide low medieval cargo sailing barge, one mast with a square sail, tarp-covered crates on a flat deck, sailing lighter, not a motor barge',
  },
  {
    id: 'prop_ship_fishing',
    label: 'Fishing sailboat',
    hull: 'small weathered fishing smack, one mast, tan canvas sail, coiled nets and lobster pots on deck, working harbor sailboat',
  },
  {
    id: 'prop_ship_caravel',
    label: 'Imperial caravel',
    hull: 'lateen caravel, triangular sails only, caravela latina like Columbus Nina, two or three masts each with one huge triangle sail hanging from a long tilted diagonal lateen yard like a Mediterranean dhow, sails are triangles not rectangles, no square sail, no course, no topsail, no horizontal yardarm, no frigate, no galleon, no ship of the line, sleek exploration hull with gold accents',
  },
  {
    id: 'prop_ship_skiff',
    label: 'Harbor skiff',
    hull: 'tiny single-masted open sailing skiff, small gaff or sprit sail, short wooden hull, harbor sailboat not a rowboat',
  },
];

/** Screen-space bow direction. Matches Phaser +x east, +y south. Avoid isolated cardinal words. */
const HEADING_VIEW: Readonly<Record<HavenShipHeading, string>> = {
  e: 'isometric three-quarter, hull axis left-to-right, bow at the right edge, stern at the left, sailing toward the right',
  se: 'isometric three-quarter, hull diagonal, bow toward the lower-right corner, stern toward the upper-left',
  s: 'true bow-on front view from slightly above, hull axis vertical on screen, bowsprit and prow at the BOTTOM of the frame pointing toward the viewer, transom receding toward the TOP, camera faces the stem, not three-quarter, not a side profile, not a museum three-quarter portrait',
  sw: 'isometric three-quarter, hull diagonal, bow toward the lower-left corner, stern toward the upper-right',
  w: 'isometric three-quarter, hull axis left-to-right, bow at the left edge, stern at the right, sailing toward the left',
  nw: 'isometric three-quarter, hull diagonal, bow toward the upper-left corner, stern toward the lower-right',
  n: 'true stern-on rear view from astern, camera faces the flat transom, hull axis vertical, rudder and empty transom in the foreground at the BOTTOM, cabin windows on the stern, no bowsprit visible, the pointed bow is far away at the TOP of the frame, sailing away, not three-quarter, not a side profile, not a museum three-quarter portrait',
  ne: 'isometric three-quarter, hull diagonal, bow toward the upper-right corner, stern toward the lower-left',
};

function shipSpec(id: string, label: string, hull: string, heading: HavenShipHeading): MediaAssetSpec {
  const painted =
    heading === 'n' || heading === 's' || id === 'prop_ship_caravel' || id.startsWith('prop_ship_caravel_')
      ? PAINTED_SPRITE
      : '';
  const intactBow =
    heading === 's' && (id === 'prop_ship_caravel' || id === 'prop_ship_caravel_s')
      ? 'intact solid wooden prow and bowsprit, whole vessel inside the frame with empty margin around the hull, the stem must not touch the image edge, no missing chunks, no holes in the bow'
      : '';
  return {
    id,
    profile: 'ship_sprite',
    label,
    params: {
      prop_name: [hull, HEADING_VIEW[heading], SAIL_ONLY, painted, intactBow].filter(Boolean).join(', '),
    },
  };
}

/** Placement ids use south art; `_e`…`_ne` are heading variants. */
export function havenShipMediaCatalog(): MediaAssetSpec[] {
  const out: MediaAssetSpec[] = [];
  for (const ship of HULLS) {
    out.push(shipSpec(ship.id, ship.label, ship.hull, 's'));
    for (const heading of HAVEN_SHIP_HEADINGS) {
      out.push(
        shipSpec(
          havenShipHeadingAssetId(ship.id, heading),
          `${ship.label} ${heading.toUpperCase()}`,
          ship.hull,
          heading,
        ),
      );
    }
  }
  return out;
}
