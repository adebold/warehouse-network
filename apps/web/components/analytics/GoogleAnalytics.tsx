import Script from 'next/script'

interface GoogleAnalyticsProps {
  measurementId: string
}

const GoogleAnalytics: React.FC<GoogleAnalyticsProps> = ({ measurementId }) => {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${measurementId}', {
            page_path: window.location.pathname,
            // Enhanced measurement
            'enhanced_measurement': {
              'page_views': true,
              'scrolls': true,
              'outbound_clicks': true,
              'site_search': true,
              'video_engagement': true,
              'file_downloads': true
            },
            // Cookie settings
            'cookie_domain': 'auto',
            'cookie_expires': 63072000, // 2 years
            'cookie_prefix': 'wn_',
            'cookie_update': true,
            'cookie_flags': 'SameSite=None;Secure',
            // Privacy settings
            'anonymize_ip': false,
            'ads_data_redaction': false,
            'allow_google_signals': true,
            'allow_ad_personalization_signals': true,
            // Debug mode (remove in production)
            'debug_mode': ${process.env.NODE_ENV === 'development' ? 'true' : 'false'}
          });

          // Set up custom events
          gtag('event', 'page_view', {
            page_title: document.title,
            page_location: window.location.href,
            page_path: window.location.pathname,
            send_to: '${measurementId}'
          });
        `}
      </Script>
    </>
  )
}

export default GoogleAnalytics