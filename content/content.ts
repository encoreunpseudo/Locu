// Content script : s'exécute dans chaque page web, avec accès au DOM.
// Il lit l'annonce à la demande du popup (au moment du clic, donc la page de l'annonce est déjà chargée).

import { JinkaParseur } from "../popup/jinkaParseur";
import { LeboncoinParseur } from "../popup/leboncoinParseur";
import type { ParseurAnnonce } from "../popup/parseAnnonce";

const PARSEURS: ParseurAnnonce[] = [new JinkaParseur(), new LeboncoinParseur()];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PARSER_ANNONCE") {
    const parseur = PARSEURS.find((p) => p.peutParser(new URL(location.href)));
    sendResponse({ logement: parseur ? parseur.parser(document) : null });
  }
});
