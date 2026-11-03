import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = { title: 'Conditions d’utilisation · Myabéshop' };

export default function Terms() {
  return (
    <LegalPage title="Conditions générales d’utilisation" updated="3 novembre 2026">
      <section>
        <h2>1. Le service</h2>
        <p>Myabéshop fournit aux marchands une boutique en ligne avec paiement à la livraison, la gestion des commandes, des livreurs et de l’encaissement. Le marchand reste seul vendeur des produits proposés et responsable de leur conformité.</p>
      </section>
      <section>
        <h2>2. Compte et sécurité</h2>
        <p>L’accès se fait par numéro de téléphone et code à usage unique, ou par e-mail et mot de passe. Le marchand est responsable des accès qu’il donne à son équipe et à ses livreurs (code PIN).</p>
      </section>
      <section>
        <h2>3. Abonnements</h2>
        <ul>
          <li>Essai gratuit de 14 jours du plan Pro à l’inscription.</li>
          <li>Paiement mensuel ou annuel (2 mois offerts) par Mobile Money ; une facture est émise à chaque paiement.</li>
          <li>À l’échéance : 7 jours de grâce, puis passage automatique au plan Gratuit, sans suppression de données.</li>
          <li>Les commandes reçues au-delà de la limite mensuelle du plan sont conservées et deviennent traitables après changement de plan.</li>
        </ul>
      </section>
      <section>
        <h2>4. Produits interdits</h2>
        <p>Sont interdits notamment la contrefaçon, les médicaments et produits réglementés sans autorisation, les armes et tout produit illégal dans le pays de vente. Myabéshop peut suspendre une boutique qui ne respecte pas ces règles.</p>
      </section>
      <section>
        <h2>5. Disponibilité</h2>
        <p>Myabéshop vise une disponibilité de 99,5 % par mois et sauvegarde les données chaque jour (conservation 30 jours).</p>
      </section>
      <section>
        <h2>6. Contact</h2>
        <p>Nicanor KSH Solutions (NKS), Calavi-Zogbadjè, Cotonou, Bénin.</p>
      </section>
    </LegalPage>
  );
}
