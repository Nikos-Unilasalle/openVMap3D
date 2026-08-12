import { Font, FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import helvetikerData from "./helvetikerData.json";

export const defaultFont: Font = new FontLoader().parse(helvetikerData);
