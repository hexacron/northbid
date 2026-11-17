# Northbid

[English](README.md) | **Français**

Interrogez les données d'approvisionnement du gouvernement du Canada depuis votre assistant IA. Northbid est un serveur local [Model Context Protocol](https://modelcontextprotocol.io) : il charge les données ouvertes publiées par [AchatsCanada](https://achatscanada.canada.ca/fr/donnees-d-approvisionnement-et-d-attribution) dans une petite base de données sur votre ordinateur et donne à l'assistant des outils pour y chercher, en français ou en anglais.

Il fonctionne avec Claude Code et Cowork, Codex et l'application de bureau ChatGPT, Gemini CLI et tout autre client capable de lancer un serveur MCP local. Il est gratuit, ne demande aucun compte et n'a aucune dépendance autre que Node.js.

> **Non officiel.** Northbid n'est ni affilié au gouvernement du Canada, à AchatsCanada ou à Services publics et Approvisionnement Canada, ni approuvé par eux. Le site AchatsCanada fait foi ; vérifiez-y chaque détail avant de soumissionner.

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
git clone https://github.com/hexacron/northbid.git
codex mcp add northbid -- node /chemin/absolu/vers/northbid/server/index.js
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

## Licence et attribution

Le code est publié sous la [licence MIT](LICENSE).

Contient de l'information visée par la [Licence du gouvernement ouvert – Canada](https://ouvert.canada.ca/fr/licence-du-gouvernement-ouvert-canada). Les données sont publiées par Services publics et Approvisionnement Canada par l'entremise d'AchatsCanada.
