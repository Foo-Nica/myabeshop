import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Confidentialité · Myabéshop' };

export default function Privacy() {
  return (
    <LegalPage title="Politique de confidentialité" updated="3 novembre 2026">
      <section>
        <h2>Données collectées</h2>
        <ul>
          <li>Marchands et équipes : nom, téléphone, e-mail, paramètres de la boutique, journal des actions sensibles.</li>
          <li>Clients finaux : nom, téléphone, quartier, repère, position GPS si le client l’accepte, historique de commandes dans la boutique concernée.</li>
          <li>Paiements d’abonnement : montant, opérateur, numéro payeur et référence de la passerelle (aucune donnée de carte n’est stockée).</li>
        </ul>
      </section>
      <section>
        <h2>Finalités</h2>
        <p>Traiter et livrer les commandes, prévenir la fraude (doublons, score client, liste noire propre à chaque boutique), facturer les abonnements, assurer le support.</p>
      </section>
      <section>
        <h2>Cloisonnement</h2>
        <p>Les données d’une boutique ne sont jamais visibles depuis une autre boutique ; ce cloisonnement est vérifié par des tests automatisés.</p>
      </section>
      <section>
        <h2>Vos droits</h2>
        <p>Conformément aux lois applicables (loi n° 2017-20 portant code du numérique au Bénin, loi ivoirienne 2013-450, loi sénégalaise 2008-12, NDPA au Nigeria) et aux principes du RGPD, vous pouvez demander l’accès, la rectification, l’export ou la suppression de vos données auprès du marchand ou de Myabéshop.</p>
      </section>
      <section>
        <h2>Sous-traitants</h2>
        <p>Hébergement, stockage d’images, passerelle de paiement Mobile Money et fournisseur SMS / WhatsApp, choisis pour leur présence en Afrique de l’Ouest et leurs garanties de sécurité.</p>
      </section>
    </LegalPage>
  );
}
