<p align="center">
  <img src="assets/icon.svg" width="96" height="96" alt="Logo de Northbid">
</p>

<h1 align="center">Northbid</h1>

<p align="center">
  Cherchez les appels d'offres, les contrats attribués et les offres à commandes du gouvernement du Canada depuis votre assistant IA.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/northbid"><img src="https://img.shields.io/npm/v/northbid" alt="Version npm"></a>
  <a href="https://github.com/hexacron/northbid/actions/workflows/ci.yml"><img src="https://github.com/hexacron/northbid/actions/workflows/ci.yml/badge.svg" alt="État de l'intégration continue"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022.16-339933" alt="Node.js 22.16 ou plus récent">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Aucune dépendance">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/hexacron/northbid" alt="Licence MIT"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>Français</strong>
</p>

Interrogez les données d'approvisionnement du gouvernement du Canada depuis votre assistant IA. Northbid est un serveur local [Model Context Protocol](https://modelcontextprotocol.io) : il charge les données ouvertes publiées par [AchatsCanada](https://achatscanada.canada.ca/fr/donnees-d-approvisionnement-et-d-attribution) dans une petite base de données sur votre ordinateur et donne à l'assistant des outils pour y chercher, en français ou en anglais.

Il fonctionne avec Claude Code et Cowork, Codex et l'application de bureau ChatGPT, Gemini CLI et tout autre client capable de lancer un serveur MCP local. Il est gratuit, ne demande aucun compte et n'a aucune dépendance autre que Node.js.

> **Non officiel.** Northbid n'est ni affilié au gouvernement du Canada, à AchatsCanada ou à Services publics et Approvisionnement Canada, ni approuvé par eux. Le site AchatsCanada fait foi ; vérifiez-y chaque détail avant de soumissionner.

## Exemple

> **Vous :** Quels fournisseurs ont obtenu le plus de contrats de traduction depuis avril 2025 ?

L'assistant appelle `summarize_awards` avec `{"group_by": "supplier", "query": "translation OR traduction", "awarded_after": "2025-04-01"}` et répond à partir du résultat :

> 171 avis d'attribution correspondent, pour un total de 44,9 millions de dollars répartis entre 114 fournisseurs. Les trois premiers selon la valeur :
>
> | Fournisseur | Attributions | Valeur totale (CAD) | Plus grande attribution (CAD) |
> |---|---|---|---|
> | R&R International Translation Specialists Inc. | 5 | 8 146 105 $ | 7 342 315 $ |
> | Communications SYM inc. | 8 | 4 560 685 $ | 1 437 188 $ |
> | Adirondack Information Management Inc. | 1 | 3 749 340 $ | 3 749 340 $ |
>
> 89 des 171 avis n'indiquent aucune valeur, surtout des offres à commandes et des arrangements en matière d'approvisionnement ; les totaux sont donc indicatifs.

Les chiffres sont un résultat réel de l'outil, tiré des données du 17 novembre 2026. La formulation de la réponse dépend de votre assistant.

## Prérequis

Node.js **22.16 ou plus récent** (24 ou plus récent recommandé). Vérifiez avec `node --version`. Node 23 n'est pas pris en charge : son SQLite intégré n'a pas la recherche en texte intégral.

## Installation

### Claude Code et Cowork

```
/plugin marketplace add hexacron/northbid
/plugin install northbid@northbid
```

Le plugiciel ajoute le serveur et une compétence `find-opportunities`. Les serveurs MCP locaux ne s'exécutent pas dans le clavardage claude.ai sur le Web ; vous n'y aurez que la compétence.

### Codex et l'application de bureau ChatGPT

```bash
codex mcp add northbid -- npx -y northbid
```

Codex et l'application de bureau ChatGPT partagent cette configuration.

### Gemini CLI

```bash
gemini extensions install https://github.com/hexacron/northbid
```

### Tout autre client MCP

Déclarez un serveur stdio qui lance `npx -y northbid`. Le paquet est récupéré depuis npm ; il n'y a rien à cloner :

```json
{
  "mcpServers": {
    "northbid": { "command": "npx", "args": ["-y", "northbid"] }
  }
}
```

Pour l'exécuter à partir des sources, clonez le dépôt et utilisez `node /chemin/absolu/vers/northbid/server/index.js`. [docs/clients.md](docs/clients.md) donne la configuration de chaque client et précise ce qui a été testé.

## Ce que vous pouvez demander

- « Quels appels d'offres fédéraux sont ouverts pour des travaux de construction au Québec ? »
- « Trouve les appels d'offres fédéraux ouverts en services de traduction que je pourrais livrer en Ontario. »
- « Quelles occasions en sécurité informatique ferment d'ici trois semaines ? Montre les critères de sélection des trois premières. »
- « Quels fournisseurs détiennent des offres à commandes pour des véhicules légers, et quand expirent-elles ? »
- « Qui a obtenu les derniers contrats de déneigement à la BFC Petawawa, et pour quel montant ? »
- « Quels fournisseurs ont obtenu le plus de contrats de traduction depuis avril 2025 ? »

## Ce qui est couvert

| Jeu de données | Enregistrements | Mise à jour à la source |
|---|---|---|
| Avis d'appel d'offres ouverts | environ 950 | quotidienne, plus les nouveaux avis toutes les 2 heures |
| Offres à commandes et arrangements en matière d'approvisionnement actifs | environ 4 000 ententes | hebdomadaire |
| Avis d'attribution depuis août 2022 | environ 30 000 | quotidienne |

Organisations fédérales seulement. Les modifications de contrats, les appels d'offres fermés et les archives antérieures à août 2022 figurent sur la [feuille de route](#feuille-de-route). Le schéma et les particularités connues sont décrits dans [docs/data.md](docs/data.md) (en anglais).

## Outils

| Outil | Ce qu'il fait |
|---|---|
| `search_tenders` | Cherche les appels d'offres ouverts par mot-clé, acheteur, catégorie, code UNSPSC, région de livraison et dates |
| `get_tender` | Fiche complète d'un appel d'offres : description, critères, accords commerciaux, personne-ressource, pièces jointes |
| `search_standing_offers` | Cherche les offres à commandes et les arrangements en matière d'approvisionnement par mot-clé, fournisseur, ministère, produit |
| `search_awards` | Cherche les contrats attribués par mot-clé, fournisseur, acheteur, catégorie, code UNSPSC, région, valeur et dates |
| `get_award` | Fiche complète d'une attribution : fournisseur, valeur, dates du contrat, méthode d'approvisionnement, description |
| `summarize_awards` | Compte les attributions et additionne leur valeur par fournisseur, acheteur ou année |
| `data_status` | Indique ce qui est chargé et la date des données |
| `refresh_data` | Vérifie tout de suite si AchatsCanada a publié des fichiers plus récents |

La recherche porte sur le texte français et anglais à la fois et ne tient pas compte des accents : `deneigement` trouve « déneigement ». Passez `lang: "fr"` pour obtenir les résultats en français ; l'assistant le fait de lui-même quand vous lui écrivez en français. Les paramètres et des exemples de résultats sont dans [docs/tools.md](docs/tools.md) (en anglais).

## Ce qu'il fait sur votre ordinateur

- **Il télécharge** des fichiers CSV depuis `canadabuys.canada.ca` et `sosa.canadabuys.canada.ca` : trois fichiers, environ 10 Mo au total, à la première utilisation, puis cinq autres, environ 110 Mo au total, la première fois que vous posez une question sur les contrats attribués. Il les revérifie ensuite selon un calendrier et ne télécharge que ce qui a changé. L'un de ces hôtes présente une chaîne de certificats incomplète ; le certificat intermédiaire manquant est donc récupéré à l'adresse indiquée dans le certificat (actuellement `crt.sectigo.com`) et vérifié à l'aide des autorités racines de Node.
- **Il conserve** les données dans un seul fichier SQLite, dans le répertoire de données du plugiciel ou, hors de Claude, dans le répertoire de cache de votre système d'exploitation. Le fichier atteint environ 165 Mo une fois les attributions chargées. Vous pouvez le supprimer sans risque ; il est reconstruit à la prochaine utilisation.
- **Il n'envoie rien d'autre.** Vos recherches et vos conversations restent sur votre machine. Il n'y a ni télémétrie ni compte. Voir [PRIVACY.md](PRIVACY.md) (en anglais).

Réglages, tous des variables d'environnement facultatives :

| Variable | Effet |
|---|---|
| `NORTHBID_DATA_DIR` | Emplacement de la base de données |
| `NORTHBID_OFFLINE=1` | Ne jamais utiliser le réseau ; se servir des données déjà téléchargées |

## Dépannage

- **« northbid needs Node.js 22.16 or newer »** : le `node` de votre PATH est trop ancien, ou c'est une version 23.x. Installez une version LTS récente.
- **« Could not download … »** : le site source était inaccessible. Les recherches continuent avec les dernières données téléchargées et le signalent dans un champ `warnings`. Demandez à l'assistant de lancer `refresh_data` pour réessayer.
- **Un appel d'offres est absent** : un nouvel avis peut mettre jusqu'à une journée à paraître dans les fichiers de données ouvertes. Consultez `data_status` pour connaître la date des données.
- **Les heures de clôture** sont données en UTC−05:00 toute l'année, et non à l'heure locale.
- **Autre chose** : [ouvrez un ticket](https://github.com/hexacron/northbid/issues), en français ou en anglais.

## Feuille de route

1. Historique des contrats avec chaque modification, et téléchargement facultatif des archives depuis 2009.
2. Un outil SQL en lecture seule pour les questions que les outils de recherche ne couvrent pas.
3. Divulgation proactive des contrats de plus de 10 000 $ de tous les ministères.

## Documentation

La documentation détaillée est en anglais.

- [docs/clients.md](docs/clients.md) : configuration de chaque client
- [docs/tools.md](docs/tools.md) : référence des outils
- [docs/data.md](docs/data.md) : jeux de données, schéma et mises en garde
- [docs/architecture.md](docs/architecture.md) : architecture
- [CONTRIBUTING.md](CONTRIBUTING.md) : développement et tests
- [SECURITY.md](SECURITY.md) : signalement d'une vulnérabilité, limites de confiance, fabrication des versions

## Licence et attribution

Le code est publié sous la [licence MIT](LICENSE).

Contient de l'information visée par la [Licence du gouvernement ouvert – Canada](https://ouvert.canada.ca/fr/licence-du-gouvernement-ouvert-canada). Les données sont publiées par Services publics et Approvisionnement Canada par l'entremise d'AchatsCanada.
