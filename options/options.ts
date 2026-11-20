import { Geocodeur } from "../popup/trajets/Geocodeur";
import type { Lieu } from "../popup/trajets/types";
import type { Position } from "../popup/localisation/types";

const MAX_LIEUX = 5;
const geocodeur = new Geocodeur();

const listeEl = document.getElementById("lieux") as HTMLUListElement;
const formulaire = document.getElementById("ajout") as HTMLFormElement;
const nomEl = document.getElementById("nom") as HTMLInputElement;
const adresseEl = document.getElementById("adresse") as HTMLInputElement;
const suggestionsEl = document.getElementById("suggestions") as HTMLUListElement;
const ajouterEl = document.getElementById("ajouter") as HTMLButtonElement;
const statutEl = document.getElementById("statut") as HTMLParagraphElement;

let lieux: Lieu[] = [];
let suggestions: { label: string; position: Position }[] = [];
let choisie: { label: string; position: Position } | undefined;
let surbrillance = -1;
let attente: ReturnType<typeof setTimeout> | undefined;
let derniereRecherche = 0;

function statut(texte: string, erreur = false) {
  statutEl.textContent = texte;
  statutEl.className = erreur ? "erreur" : "";
}

async function enregistrer() {
  await chrome.storage.sync.set({ lieux });
  afficherLieux();
}

function afficherLieux() {
  listeEl.replaceChildren();
  if (!lieux.length) {
    const vide = document.createElement("li");
    vide.className = "vide";
    vide.textContent = "Aucun lieu enregistré.";
    listeEl.append(vide);
  }
  for (const lieu of lieux) {
    const li = document.createElement("li");
    const texte = document.createElement("div");
    const nom = document.createElement("div");
    nom.className = "nom";
    nom.textContent = lieu.nom;
    const adresse = document.createElement("div");
    adresse.className = "adresse";
    adresse.textContent = lieu.adresse;
    texte.append(nom, adresse);
    const supprimer = document.createElement("button");
    supprimer.className = "supprimer";
    supprimer.textContent = "Supprimer";
    supprimer.setAttribute("aria-label", `Supprimer ${lieu.nom}`);
    supprimer.addEventListener("click", async () => {
      lieux = lieux.filter((l) => l.id !== lieu.id);
      await enregistrer();
      statut(`${lieu.nom} supprimé.`);
    });
    li.append(texte, supprimer);
    listeEl.append(li);
  }
  const plein = lieux.length >= MAX_LIEUX;
  nomEl.disabled = adresseEl.disabled = plein;
  if (plein) statut(`${MAX_LIEUX} lieux au maximum.`);
  majBouton();
}

function majBouton() {
  ajouterEl.disabled = !choisie || !nomEl.value.trim() || lieux.length >= MAX_LIEUX;
}

function afficherSuggestions() {
  suggestionsEl.replaceChildren(...suggestions.map((s, i) => {
    const li = document.createElement("li");
    li.id = `suggestion-${i}`;
    li.role = "option";
    li.textContent = s.label;
    li.setAttribute("aria-selected", String(i === surbrillance));
    // mousedown : avant que le champ perde le focus.
    li.addEventListener("mousedown", (e) => { e.preventDefault(); choisir(s); });
    return li;
  }));
  adresseEl.setAttribute("aria-expanded", String(suggestions.length > 0));
  adresseEl.setAttribute("aria-activedescendant", surbrillance >= 0 ? `suggestion-${surbrillance}` : "");
}

function choisir(s: { label: string; position: Position }) {
  choisie = s;
  adresseEl.value = s.label;
  suggestions = [];
  surbrillance = -1;
  afficherSuggestions();
  statut("");
  majBouton();
}

adresseEl.addEventListener("input", () => {
  choisie = undefined;
  majBouton();
  clearTimeout(attente);
  const texte = adresseEl.value;
  attente = setTimeout(async () => {
    const recherche = ++derniereRecherche;
    try {
      const resultats = await geocodeur.suggerer(texte);
      if (recherche !== derniereRecherche) return; // une frappe plus récente a pris le relais
      suggestions = resultats;
      surbrillance = -1;
      afficherSuggestions();
      statut(texte.trim().length >= 3 && !resultats.length ? "Aucune adresse trouvée en Île-de-France." : "");
    } catch {
      statut("Service d'adresses injoignable, réessaie dans un instant.", true);
    }
  }, 300);
});

adresseEl.addEventListener("keydown", (e) => {
  if (!suggestions.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    surbrillance = (surbrillance + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
    afficherSuggestions();
  } else if (e.key === "Enter" && surbrillance >= 0) {
    e.preventDefault();
    choisir(suggestions[surbrillance]);
  } else if (e.key === "Escape") {
    suggestions = [];
    afficherSuggestions();
  }
});

nomEl.addEventListener("input", majBouton);

formulaire.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!choisie) {
    statut("Choisis une adresse dans la liste proposée.", true);
    return;
  }
  const nom = nomEl.value.trim();
  lieux = [...lieux, { id: crypto.randomUUID(), nom, adresse: choisie.label, position: choisie.position }];
  await enregistrer();
  formulaire.reset();
  choisie = undefined;
  majBouton();
  statut(`${nom} ajouté.`);
});

chrome.storage.sync.get("lieux").then(({ lieux: enregistres }) => {
  lieux = Array.isArray(enregistres) ? enregistres : [];
  afficherLieux();
});
