import { Font, FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import helvetikerData from "./helvetikerData.json";
import abel from "./abel.json";
import anton from "./anton.json";
import bangers from "./bangers.json";
import cinzel from "./cinzel.json";
import lobster from "./lobster.json";
import montserrat from "./montserrat.json";
import oswald from "./oswald.json";
import pacifico from "./pacifico.json";
import poppins from "./poppins.json";
import quicksand from "./quicksand.json";
import raleway from "./raleway.json";

const loader = new FontLoader();

/** Bundled three.js fonts the Text node offers in its Font menu. */
export const BUILTIN_FONTS: Record<string, Font> = {
  Helvetiker: loader.parse(helvetikerData as never),
  Abel: loader.parse(abel as never),
  Anton: loader.parse(anton as never),
  Bangers: loader.parse(bangers as never),
  Cinzel: loader.parse(cinzel as never),
  Lobster: loader.parse(lobster as never),
  Montserrat: loader.parse(montserrat as never),
  Oswald: loader.parse(oswald as never),
  Pacifico: loader.parse(pacifico as never),
  Poppins: loader.parse(poppins as never),
  Quicksand: loader.parse(quicksand as never),
  Raleway: loader.parse(raleway as never),
};

export const FONT_NAMES = Object.keys(BUILTIN_FONTS);
