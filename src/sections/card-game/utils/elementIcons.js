import fireIcon from '../../../assets/elements/fire-icon.png';
import iceIcon from '../../../assets/elements/ice-icon.png';
import earthIcon from '../../../assets/elements/earth-icon.png';
import airIcon from '../../../assets/elements/air-icon.png';
import electricIcon from '../../../assets/elements/lightning-icon.png';
import waterIcon from '../../../assets/elements/water-icon.png';
import deathIcon from '../../../assets/elements/death-icon.png';

const ELEMENT_ICONS = {
    fire: fireIcon,
    ice: iceIcon,
    earth: earthIcon,
    air: airIcon,
    electric: electricIcon,
    water: waterIcon,
    death: deathIcon,
};

export const getElementIcon = (element) => ELEMENT_ICONS[element] ?? null;
