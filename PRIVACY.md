# Datenschutzerklärung und Nutzungshinweise für Sondra

**Stand: 22. September 2026**

> **Wichtiger Hinweis:** Diese Vorlage beschreibt das Verhalten der aktuell geprüften Anwendung. Sie ist keine individuelle Rechtsberatung und ersetzt insbesondere kein Impressum und keine rechtliche Prüfung nach dem Recht des Landes, in dem Sondra betrieben wird.

## 1. Geltungsbereich

Diese Datenschutzerklärung gilt für die Webanwendung **Sondra** (Repository: Lizge). Sondra ist grundsätzlich als lokal arbeitendes Medienwerkzeug konzipiert. Medienverarbeitung, Umwandlung, Analyse und Bearbeitung finden grundsätzlich im Browser des Nutzers statt.

## 2. Verantwortlicher

Verantwortlich für den Betrieb der jeweiligen Sondra-Instanz ist grundsätzlich derjenige, der die konkrete Website bzw. den konkreten Dienst bereitstellt.

Für eine veröffentlichte Instanz sind hier die tatsächlichen Angaben des Betreibers einzutragen:

- **Name/Firma:** [BITTE EINTRAGEN]
- **Anschrift:** [BITTE EINTRAGEN]
- **E-Mail:** [BITTE EINTRAGEN]

Der Betreiber sollte diese Angaben vor einer öffentlichen Veröffentlichung rechtlich prüfen und ein erforderliches Impressum bereitstellen.

## 3. Grundsatz: Verarbeitung möglichst lokal

Sondra ist darauf ausgelegt, dass vom Nutzer ausgewählte Medien nicht an den Betreiber der Website hochgeladen werden. Die eigentliche Medienverarbeitung läuft im Browser bzw. auf dem Gerät des Nutzers, unter anderem mit WebAssembly und Web Workers.

Nach dem Projektstand werden für die lokale Verarbeitung insbesondere keine eigenen Uploads an einen zentralen Sondra-Server benötigt. Die Anwendung verwendet nach der Projektbeschreibung weder Analytics noch Google Fonts oder ein CDN für die eigene Oberfläche.

Die Anwendung verwendet außerdem nach dem geprüften Projektstand keine `localStorage`- oder IndexedDB-Speicherung und keine eigenen Cookies für die Medienverarbeitung. Sitzungsdaten können daher beim Schließen des Tabs bzw. der Anwendung verloren gehen.

## 4. Ausnahme: Downloader / externe Dienste

Die Downloader-Funktion ist eine **optionale Ausnahme** vom lokalen Verarbeitungsprinzip.

Wenn ein Nutzer einen externen Extraktions- oder Download-Dienst einträgt und diese Funktion verwendet, wird die vom Nutzer eingegebene Adresse an den von ihm ausgewählten Dienst übertragen. Der Betreiber von Sondra kontrolliert diesen externen Dienst nicht automatisch.

Je nach Dienst können dabei insbesondere folgende Informationen technisch beim externen Dienst anfallen:

- die vom Nutzer angefragte URL,
- die IP-Adresse des Nutzers,
- technische Verbindungsdaten,
- weitere Daten, die der externe Dienst nach seinen eigenen Regeln verarbeitet.

Sondra setzt deshalb keinen festen zentralen Download-Dienst voraus. Nutzer sollen nur Dienste verwenden, denen sie hinsichtlich Datenschutz und Sicherheit vertrauen.

**Wichtig:** Die Datenschutzbestimmungen des jeweils verwendeten externen Dienstes gelten zusätzlich. Für dessen Datenverarbeitung ist der jeweilige Dienstbetreiber verantwortlich.

## 5. Eigene Dateien und Medien

Vom Nutzer ausgewählte Audio-, Video- und Bilddateien werden grundsätzlich lokal im Browser verarbeitet. Die Anwendung ist so ausgelegt, dass eigene Dateien nicht für die lokale Verarbeitung an einen zentralen Sondra-Server hochgeladen werden müssen.

Nutzer sind selbst dafür verantwortlich, dass sie die erforderlichen Rechte zur Verarbeitung, Umwandlung, Analyse, Speicherung oder sonstigen Nutzung der von ihnen eingegebenen Medien besitzen.

## 6. Keine Garantie für absolute Datensicherheit

Trotz des lokalen Designs kann keine Software absolute Sicherheit garantieren. Browser, Betriebssysteme, Hosting-Anbieter, Netzwerkverbindungen, Erweiterungen, externe Dienste und Änderungen an Abhängigkeiten können ihr Verhalten ändern.

Nutzer sollten insbesondere bei vertraulichen oder besonders schützenswerten Dateien nur eine vertrauenswürdige und überprüfte Umgebung verwenden.

## 7. Externe Inhalte und Drittanbieter

Wenn Nutzer externe Dienste, Medienquellen oder Download-Endpunkte verwenden, können diese Dienste eigene Datenverarbeitungen durchführen. Sondra übernimmt keine Verantwortung für Datenschutzpraktiken, Verfügbarkeit, Inhalte oder Protokollierung eines vom Nutzer selbst ausgewählten Drittanbieters.

Der Nutzer sollte vor der Verwendung eines externen Dienstes dessen eigene Datenschutzinformationen und Nutzungsbedingungen prüfen.

## 8. Protokollierung und Hosting

Die Anwendung selbst ist auf eine lokale Verarbeitung ausgelegt. Ein Hosting-Anbieter kann jedoch unabhängig von der Anwendung technische Server- oder Zugriffsprotokolle führen, beispielsweise IP-Adresse, Zeitpunkt, angeforderte Ressource und technische Browser-/Verbindungsdaten.

Welche Protokolle tatsächlich geführt werden, hängt vom jeweiligen Hosting- und Infrastruktur-Anbieter ab und kann nicht allein durch den Sondra-Quellcode ausgeschlossen werden.

Für eine konkrete öffentliche Bereitstellung muss der Betreiber deshalb die Protokollierungs- und Datenschutzpraxis seines Hosters prüfen und diese gegebenenfalls hier ergänzen.

## 9. Verantwortlichkeit der Nutzer

Die Nutzung von Sondra erfolgt grundsätzlich in eigener Verantwortung des jeweiligen Nutzers.

Der Nutzer ist insbesondere selbst dafür verantwortlich,

1. nur Dateien und Inhalte zu verarbeiten, deren Nutzung ihm rechtlich erlaubt ist;
2. bei Downloads die Rechte der jeweiligen Rechteinhaber und die geltenden Gesetze einzuhalten;
3. keine rechtswidrigen, schädlichen oder unbefugten Inhalte zu verarbeiten;
4. bei externen Diensten deren Datenschutzbestimmungen und Nutzungsbedingungen zu beachten;
5. keine vertraulichen Daten an einen externen Dienst zu übermitteln, dem er nicht vertraut;
6. die von ihm eingegebenen URLs und Dateien vor der Verarbeitung zu prüfen.

## 10. Haftungs- und Nutzungshinweis

Sondra wird als Software zur Verfügung gestellt. **Soweit gesetzlich zulässig, erfolgt die Nutzung auf eigenes Risiko.**

Der Betreiber bzw. Autor übernimmt – soweit gesetzlich zulässig – keine Verantwortung für Schäden, Datenverlust, Ausfälle, fehlerhafte Verarbeitung, unvollständige Ergebnisse, Rechtsverletzungen durch Nutzer oder Folgen der Nutzung eines vom Nutzer ausgewählten externen Dienstes.

Eine solche Haftungsbeschränkung gilt **nicht**, soweit zwingendes Recht eine Haftung vorsieht, insbesondere nicht bei Haftung, die gesetzlich nicht ausgeschlossen oder begrenzt werden darf.

Diese Klausel soll nicht den Eindruck erwecken, dass sämtliche gesetzlichen Pflichten oder Haftungen ausgeschlossen werden können. Die konkrete Haftungsregelung sollte für die tatsächliche Betreiberstruktur und das anwendbare Recht juristisch geprüft werden.

## 11. Urheberrecht und Rechte an Medien

Sondra gewährt keine Rechte an den über die Anwendung erreichbaren Medien. Die Verantwortung dafür, ob ein bestimmtes Medium heruntergeladen, kopiert, umgewandelt, analysiert oder anderweitig verarbeitet werden darf, liegt beim Nutzer im Rahmen des jeweils anwendbaren Rechts.

## 12. Änderungen

Diese Datenschutzerklärung kann angepasst werden, wenn sich Funktionen, Infrastruktur, externe Dienste oder gesetzliche Anforderungen ändern.

Bei wesentlichen Änderungen sollte die veröffentlichte Version mit einem aktualisierten Standdatum versehen werden.

## 13. Kontakt und Datenschutzanfragen

Datenschutzanfragen an den Betreiber der jeweiligen öffentlichen Instanz sind an die oben angegebene Kontaktadresse zu richten.

**Bitte vor Veröffentlichung ersetzen:**

- `[BITTE EINTRAGEN]` beim Verantwortlichen,
- Angaben zum tatsächlichen Hosting-Anbieter,
- Angaben zu tatsächlich eingesetzten externen Diensten,
- gegebenenfalls Angaben zu Cookies, Logs oder anderen Diensten, die durch die konkrete Deployment-Umgebung hinzukommen.
