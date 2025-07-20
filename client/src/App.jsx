import Footer from './components/Footer';
import DownloadForm from './components/Download';
import Header from './components/Header';
import Navigation from './components/Navigation';
import FeaturesSection from './components/FeaturesSection';

const YouTubeDownloader = () => {

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-[#37583D] flex justify-center items-start sm:p-8 font-sans">
        <div className="w-full max-w-6xl">
          <Header />
          <DownloadForm />
          <FeaturesSection />
        </div>
      </div>
      <Footer />
    </>
  );
};

export default YouTubeDownloader;
