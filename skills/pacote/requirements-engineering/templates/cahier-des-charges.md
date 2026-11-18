# Cahier des Charges (Requirements Specification)

Restates a client brief as a verifiable, signed specification.
Pairs with the `project-discovery` and `requirements-engineering` skills. Use when a client brief must become a contractual reference.

## 1. Contexte et objectifs (Context and Business Objectives)

Contexte: `<current situation, one paragraph>`

| ID | Objectif metier (Business objective) | Indicateur de succes (Success metric) | Cible (Target) | Echeance (Deadline) |
|---|---|---|---|---|
| OBJ-001 | `<objective>` | `<measurable indicator>` | `<value>` | `<YYYY-MM-DD>` |

## 2. Parties prenantes (Stakeholders)

| Nom / Role | Organisation | Responsabilite | Pouvoir de decision | Contact |
|---|---|---|---|---|
| `<name>` | `<org>` | `<role in project>` | `<yes / no / shared>` | `<email>` |

## 3. Perimetre (Perimeter)

| Inclus (In scope) | Exclus (Out of scope) | Reporte (Deferred) |
|---|---|---|
| `<capability>` | `<explicitly excluded>` | `<phase 2 item>` |

Toute demande hors perimetre passe par la procedure d'avenant decrite en section 10.

## 4. Besoins fonctionnels (Functional Needs)

| ID | Besoin | Acteur | Priorite (MoSCoW) | Critere de validation |
|---|---|---|---|---|
| BF-001 | `<need in one sentence>` | `<actor>` | `<Must / Should / Could / Will not>` | `<observable acceptance>` |

## 5. Besoins non fonctionnels (Non-Functional Needs)

| ID | Categorie | Exigence | Mesure | Seuil |
|---|---|---|---|---|
| BNF-001 | Performance | `<requirement>` | `<how measured>` | `<threshold>` |
| BNF-002 | Disponibilite | `<requirement>` | `<uptime window>` | `<percentage>` |
| BNF-003 | Securite | `<requirement>` | `<control or test>` | `<threshold>` |
| BNF-004 | Accessibilite | `<requirement>` | `<standard>` | `<level>` |
| BNF-005 | Maintenabilite | `<requirement>` | `<metric>` | `<threshold>` |
| BNF-006 | Compatibilite | `<browsers, devices, versions>` | `<test matrix>` | `<supported set>` |

## 6. Contraintes (Constraints)

| Type | Contrainte | Origine | Negociable |
|---|---|---|---|
| Technique | `<imposed stack, hosting, integration>` | `<source>` | `<yes / no>` |
| Budgetaire | `<budget envelope>` | `<sponsor>` | `<yes / no>` |
| Legale / reglementaire | `<regulation, data residency>` | `<regulation>` | `<no>` |
| Delai | `<hard date and its driver>` | `<business event>` | `<yes / no>` |
| Organisationnelle | `<team availability, approval cycles>` | `<source>` | `<yes / no>` |

## 7. Livrables (Deliverables)

| ID | Livrable | Format | Destinataire | Echeance |
|---|---|---|---|---|
| LIV-001 | `<deliverable>` | `<source code, document, environment>` | `<recipient>` | `<YYYY-MM-DD>` |

## 8. Conditions de recette et d'acceptation (Acceptance Conditions)

| ID | Critere d'acceptation | Methode de verification | Responsable | Resultat attendu |
|---|---|---|---|---|
| REC-001 | `<criterion>` | `<demo, test run, audit, measurement>` | `<name>` | `<pass condition>` |

Procedure de recette:
1. `<delivery notification and environment made available>`
2. `<client verification period: N business days>`
3. `<defect classification: blocking / major / minor>`
4. `<correction window per class>`
5. `<final acceptance: explicit sign-off or tacit after N days>`

## 9. Planning (Schedule)

| Phase | Contenu | Debut | Fin | Jalon de validation |
|---|---|---|---|---|
| `<phase>` | `<scope>` | `<YYYY-MM-DD>` | `<YYYY-MM-DD>` | `<milestone>` |

Dependances client (client-side prerequisites): `<accesses, data, decisions, third-party contacts and their due dates>`

## 10. Gouvernance et evolution (Governance and Change Control)

| Element | Regle |
|---|---|
| Comite de suivi | `<frequency, participants>` |
| Canal de decision | `<channel, response time expected>` |
| Procedure d'avenant | `<written request, impact assessment, signed amendment before work starts>` |
| Gestion des defauts | `<classification and response times>` |

## 11. Points ouverts (Open Points)

| ID | Point | Impact si non tranche | Decideur | Echeance |
|---|---|---|---|---|
| PO-001 | `<open question>` | `<blocked work>` | `<name>` | `<YYYY-MM-DD>` |

## 12. Validation

| Role | Nom | Date | Signature |
|---|---|---|---|
| Client / sponsor | `<name>` | `<YYYY-MM-DD>` | `<signature>` |
| Responsable projet | `<name>` | `<YYYY-MM-DD>` | `<signature>` |
