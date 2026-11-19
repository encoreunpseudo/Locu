export class NormaliseurLieu {
  static normaliser(texte: string): string {
    return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/œ/g, "oe")
      .replace(/\bsaint\b/g, "st").replace(/\bsainte\b/g, "ste")
      .replace(/\bbd\b/g, "boulevard").replace(/\bav\b/g, "avenue")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  static contient(texteNormalise: string, nom: string): boolean {
    return (` ${texteNormalise} `).includes(` ${this.normaliser(nom)} `);
  }

  static arrondissement(valeur?: number | string): number | undefined {
    if (valeur == null) return undefined;
    const chiffres = String(valeur).match(/\d+/)?.[0];
    if (!chiffres || (chiffres.length === 5 && !chiffres.startsWith("750"))) return undefined;
    const numero = Number(chiffres.length === 5 ? chiffres.slice(3) : chiffres);
    return Number.isInteger(numero) && numero >= 1 && numero <= 20 ? numero : undefined;
  }
}
