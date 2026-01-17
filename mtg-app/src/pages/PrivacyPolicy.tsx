import { Link } from 'react-router-dom';
import { Button } from '../components/UI/Button';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 md:p-8">
          <div className="mb-6">
            <Link to="/collection">
              <Button variant="secondary" className="mb-4">
                ← Retour
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Politique de Confidentialité
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}
            </p>
          </div>

          <div className="prose dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                1. Introduction
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                La présente politique de confidentialité décrit comment nous collectons, 
                utilisons et protégeons vos données personnelles conformément au Règlement 
                Général sur la Protection des Données (RGPD) de l'Union Européenne.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                2. Responsable du Traitement
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Le responsable du traitement des données est l'éditeur de l'application MTG Collection App.
                Pour toute question concernant vos données personnelles, vous pouvez nous contacter via 
                les moyens de contact disponibles dans l'application.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                3. Données Collectées
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-3">
                Nous collectons les données suivantes :
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li>
                  <strong>Données d'authentification</strong> : Adresse email, mot de passe (hashé)
                </li>
                <li>
                  <strong>Profil utilisateur</strong> : Pseudonyme, avatar sélectionné, langue préférée
                </li>
                <li>
                  <strong>Collection de cartes</strong> : Cartes Magic: The Gathering que vous possédez, 
                  quantités, conditions, langues
                </li>
                <li>
                  <strong>Decks</strong> : Decks créés, cartes dans chaque deck, descriptions
                </li>
                <li>
                  <strong>Wishlist</strong> : Cartes que vous souhaitez acquérir, notes, prix cibles
                </li>
                <li>
                  <strong>Statistiques</strong> : Calculs basés sur votre collection (valeur, répartition par couleur, etc.)
                </li>
                <li>
                  <strong>Données techniques</strong> : Adresse IP, type de navigateur, système d'exploitation 
                  (pour la sécurité et le support technique)
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                4. Finalités du Traitement
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-3">
                Vos données sont utilisées pour :
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li>Fournir les fonctionnalités de l'application (gestion de collection, decks, wishlist)</li>
                <li>Authentifier votre compte et assurer la sécurité</li>
                <li>Améliorer l'expérience utilisateur</li>
                <li>Gérer vos préférences et paramètres</li>
                <li>Assurer le bon fonctionnement technique de l'application</li>
                <li>Respecter nos obligations légales</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                5. Base Légale
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Le traitement de vos données personnelles est basé sur :
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4 mt-3">
                <li><strong>Votre consentement</strong> : Pour l'utilisation de l'application et le traitement de vos données</li>
                <li><strong>L'exécution d'un contrat</strong> : Pour fournir les services demandés</li>
                <li><strong>L'intérêt légitime</strong> : Pour améliorer l'application et assurer sa sécurité</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                6. Conservation des Données
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Vos données sont conservées tant que votre compte est actif. Si vous supprimez votre compte, 
                toutes vos données personnelles sont supprimées dans un délai de 30 jours, sauf obligation 
                légale de conservation plus longue.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                7. Vos Droits
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-3">
                Conformément au RGPD, vous disposez des droits suivants :
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4">
                <li>
                  <strong>Droit d'accès</strong> : Vous pouvez accéder à toutes vos données personnelles
                </li>
                <li>
                  <strong>Droit de rectification</strong> : Vous pouvez corriger vos données via votre profil
                </li>
                <li>
                  <strong>Droit à l'effacement</strong> : Vous pouvez supprimer votre compte et toutes vos données
                </li>
                <li>
                  <strong>Droit à la portabilité</strong> : Vous pouvez exporter vos données (format CSV/JSON)
                </li>
                <li>
                  <strong>Droit d'opposition</strong> : Vous pouvez vous opposer au traitement de vos données
                </li>
                <li>
                  <strong>Droit à la limitation</strong> : Vous pouvez demander la limitation du traitement
                </li>
                <li>
                  <strong>Droit de retirer votre consentement</strong> : À tout moment, sans affecter la licéité 
                  du traitement basé sur le consentement avant son retrait
                </li>
              </ul>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                Pour exercer ces droits, vous pouvez :
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4 mt-2">
                <li>Modifier vos données directement dans l'application (profil, collection, etc.)</li>
                <li>Exporter vos données depuis la page Profil</li>
                <li>Supprimer votre compte depuis la page Profil</li>
                <li>Nous contacter pour toute demande spécifique</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                8. Partage des Données
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Nous ne vendons, ne louons ni ne partageons vos données personnelles avec des tiers, 
                sauf dans les cas suivants :
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4 mt-3">
                <li><strong>Prestataires de services</strong> : Nous utilisons Firebase (Google) pour l'hébergement 
                et l'authentification. Ces services sont conformes au RGPD.</li>
                <li><strong>Obligations légales</strong> : Si la loi l'exige</li>
                <li><strong>Protection de nos droits</strong> : Pour protéger nos droits et notre sécurité</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                9. Sécurité
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger 
                vos données personnelles contre la perte, l'utilisation abusive, l'accès non autorisé, la 
                divulgation, l'altération ou la destruction. Cela inclut :
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300 ml-4 mt-3">
                <li>Chiffrement des mots de passe</li>
                <li>Authentification sécurisée</li>
                <li>Accès restreint aux données</li>
                <li>Surveillance de la sécurité</li>
                <li>Sauvegardes régulières</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                10. Cookies et Technologies Similaires
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                L'application utilise des technologies de stockage local (localStorage, sessionStorage) 
                pour mémoriser vos préférences (mode sombre, langue, etc.). Ces données restent sur votre 
                appareil et ne sont pas transmises à des tiers.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                11. Transferts Internationaux
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Vos données peuvent être stockées et traitées par Firebase (Google) dans des centres de 
                données situés en dehors de l'Union Européenne. Ces transferts sont encadrés par des 
                garanties appropriées conformes au RGPD (clauses contractuelles types, Privacy Shield, etc.).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                12. Modifications
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Nous pouvons modifier cette politique de confidentialité à tout moment. Les modifications 
                importantes vous seront notifiées par email ou via l'application. La date de dernière 
                mise à jour est indiquée en haut de cette page.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                13. Réclamations
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation 
                auprès de l'autorité de contrôle compétente (CNIL en France : 
                <a 
                  href="https://www.cnil.fr" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline ml-1"
                >
                  www.cnil.fr
                </a>).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mt-6 mb-4">
                14. Contact
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                Pour toute question concernant cette politique de confidentialité ou vos données personnelles, 
                vous pouvez nous contacter via les moyens disponibles dans l'application.
              </p>
            </section>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Link to="/collection">
              <Button variant="primary" className="w-full sm:w-auto">
                Retour à l'application
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

