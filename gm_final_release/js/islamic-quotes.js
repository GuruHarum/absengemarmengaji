(() => {
    'use strict';

    const QUOTES = [
        {text:'Hanya kepada-Mu kami menyembah dan hanya kepada-Mu kami memohon pertolongan.',source:'QS. Al-Fatihah: 5',type:'Qur’an'},
        {text:'Kitab ini menjadi petunjuk bagi orang-orang yang bertakwa.',source:'QS. Al-Baqarah: 2',type:'Qur’an'},
        {text:'Mohonlah pertolongan dengan sabar dan salat.',source:'QS. Al-Baqarah: 45',type:'Qur’an'},
        {text:'Kebaikan apa pun yang kamu usahakan, kamu akan mendapatkannya di sisi Allah.',source:'QS. Al-Baqarah: 110',type:'Qur’an'},
        {text:'Ke mana pun kamu menghadap, di sanalah tanda-tanda kebesaran Allah.',source:'QS. Al-Baqarah: 115',type:'Qur’an'},
        {text:'Berlomba-lombalah dalam kebaikan.',source:'QS. Al-Baqarah: 148',type:'Qur’an'},
        {text:'Ingatlah kepada-Ku, niscaya Aku mengingatmu; bersyukurlah kepada-Ku.',source:'QS. Al-Baqarah: 152',type:'Qur’an'},
        {text:'Sesungguhnya Allah bersama orang-orang yang sabar.',source:'QS. Al-Baqarah: 153',type:'Qur’an'},
        {text:'Kebajikan mencakup iman, berbagi, menepati janji, dan bersabar dalam kesulitan.',source:'QS. Al-Baqarah: 177',type:'Qur’an'},
        {text:'Aku dekat dan mengabulkan doa orang yang berdoa ketika ia berdoa kepada-Ku.',source:'QS. Al-Baqarah: 186',type:'Qur’an'},
        {text:'Berbuat baiklah; sesungguhnya Allah mencintai orang-orang yang berbuat baik.',source:'QS. Al-Baqarah: 195',type:'Qur’an'},
        {text:'Ya Tuhan kami, berilah kami kebaikan di dunia dan kebaikan di akhirat.',source:'QS. Al-Baqarah: 201',type:'Qur’an'},
        {text:'Boleh jadi kamu tidak menyukai sesuatu, padahal ia baik bagimu.',source:'QS. Al-Baqarah: 216',type:'Qur’an'},
        {text:'Allah mencintai orang-orang yang bertobat dan menyucikan diri.',source:'QS. Al-Baqarah: 222',type:'Qur’an'},
        {text:'Tidak ada paksaan dalam agama; jalan yang benar telah jelas dari jalan yang sesat.',source:'QS. Al-Baqarah: 256',type:'Qur’an'},
        {text:'Perumpamaan orang yang menafkahkan hartanya di jalan Allah seperti satu benih yang menumbuhkan banyak bulir.',source:'QS. Al-Baqarah: 261',type:'Qur’an'},
        {text:'Belanjakanlah sebagian dari hasil usahamu yang baik.',source:'QS. Al-Baqarah: 267',type:'Qur’an'},
        {text:'Allah menganugerahkan hikmah kepada siapa yang Dia kehendaki; siapa diberi hikmah telah diberi banyak kebaikan.',source:'QS. Al-Baqarah: 269',type:'Qur’an'},
        {text:'Allah tidak membebani seseorang melainkan sesuai kesanggupannya.',source:'QS. Al-Baqarah: 286',type:'Qur’an'},
        {text:'Ya Tuhan kami, jangan Engkau palingkan hati kami setelah Engkau memberi petunjuk.',source:'QS. Ali Imran: 8',type:'Qur’an'},
        {text:'Jika kamu mencintai Allah, ikutilah Rasul; Allah akan mencintaimu dan mengampunimu.',source:'QS. Ali Imran: 31',type:'Qur’an'},
        {text:'Kamu tidak akan memperoleh kebajikan yang sempurna sebelum menginfakkan sebagian yang kamu cintai.',source:'QS. Ali Imran: 92',type:'Qur’an'},
        {text:'Berpegangteguhlah semuanya pada tali Allah dan jangan bercerai-berai.',source:'QS. Ali Imran: 103',type:'Qur’an'},
        {text:'Hendaklah ada yang mengajak kepada kebaikan, menyuruh yang makruf, dan mencegah yang mungkar.',source:'QS. Ali Imran: 104',type:'Qur’an'},
        {text:'Bersegeralah menuju ampunan Tuhanmu dan surga yang luas.',source:'QS. Ali Imran: 133',type:'Qur’an'},
        {text:'Orang bertakwa menahan amarah dan memaafkan kesalahan orang lain.',source:'QS. Ali Imran: 134',type:'Qur’an'},
        {text:'Jangan lemah dan jangan bersedih; kamu akan mendapat kemuliaan jika beriman.',source:'QS. Ali Imran: 139',type:'Qur’an'},
        {text:'Bermusyawarahlah dalam urusan, lalu apabila telah bertekad, bertawakallah kepada Allah.',source:'QS. Ali Imran: 159',type:'Qur’an'},
        {text:'Bersabarlah, kuatkan kesabaran, dan bertakwalah agar kamu beruntung.',source:'QS. Ali Imran: 200',type:'Qur’an'},
        {text:'Beribadahlah kepada Allah dan berbuat baiklah kepada orang tua, kerabat, yatim, miskin, dan tetangga.',source:'QS. An-Nisa: 36',type:'Qur’an'},
        {text:'Allah memerintahkan agar amanah disampaikan kepada yang berhak dan hukum ditegakkan dengan adil.',source:'QS. An-Nisa: 58',type:'Qur’an'},
        {text:'Apabila kamu diberi penghormatan, balaslah dengan yang lebih baik atau yang sepadan.',source:'QS. An-Nisa: 86',type:'Qur’an'},
        {text:'Siapa berbuat salah lalu memohon ampun kepada Allah akan mendapati Allah Maha Pengampun lagi Maha Penyayang.',source:'QS. An-Nisa: 110',type:'Qur’an'},
        {text:'Banyak pembicaraan rahasia tidak baik, kecuali yang mengajak sedekah, kebaikan, atau perdamaian.',source:'QS. An-Nisa: 114',type:'Qur’an'},
        {text:'Tegakkanlah keadilan sebagai saksi karena Allah, sekalipun terhadap diri sendiri.',source:'QS. An-Nisa: 135',type:'Qur’an'},
        {text:'Tolong-menolonglah dalam kebajikan dan takwa, bukan dalam dosa dan permusuhan.',source:'QS. Al-Ma’idah: 2',type:'Qur’an'},
        {text:'Jangan biarkan kebencian mendorongmu berlaku tidak adil; berlaku adillah karena itu lebih dekat kepada takwa.',source:'QS. Al-Ma’idah: 8',type:'Qur’an'},
        {text:'Menjaga satu kehidupan seakan-akan menjaga kehidupan seluruh manusia.',source:'QS. Al-Ma’idah: 32',type:'Qur’an'},
        {text:'Untuk setiap umat ada aturan dan jalan; berlomba-lombalah dalam kebaikan.',source:'QS. Al-Ma’idah: 48',type:'Qur’an'},
        {text:'Yang buruk tidak sama dengan yang baik, meskipun banyaknya yang buruk membuatmu kagum.',source:'QS. Al-Ma’idah: 100',type:'Qur’an'},
        {text:'Tuhanmu telah menetapkan kasih sayang pada diri-Nya.',source:'QS. Al-An’am: 54',type:'Qur’an'},
        {text:'Kunci-kunci semua yang gaib ada pada-Nya; Dia mengetahui apa yang di darat dan di laut.',source:'QS. Al-An’am: 59',type:'Qur’an'},
        {text:'Makanlah dari buahnya ketika berbuah dan tunaikan haknya; jangan berlebihan.',source:'QS. Al-An’am: 141',type:'Qur’an'},
        {text:'Siapa membawa satu kebaikan mendapat balasan sepuluh kali lipat.',source:'QS. Al-An’am: 160',type:'Qur’an'},
        {text:'Salat, ibadah, hidup, dan matiku hanyalah untuk Allah, Tuhan seluruh alam.',source:'QS. Al-An’am: 162',type:'Qur’an'},
        {text:'Makan dan minumlah, tetapi jangan berlebihan.',source:'QS. Al-A’raf: 31',type:'Qur’an'},
        {text:'Berdoalah kepada Tuhanmu dengan rendah hati dan suara yang lembut.',source:'QS. Al-A’raf: 55',type:'Qur’an'},
        {text:'Jangan membuat kerusakan setelah keadaan diperbaiki; berdoalah dengan takut dan penuh harap.',source:'QS. Al-A’raf: 56',type:'Qur’an'},
        {text:'Seandainya penduduk negeri beriman dan bertakwa, niscaya dibukakan keberkahan dari langit dan bumi.',source:'QS. Al-A’raf: 96',type:'Qur’an'},
        {text:'Jadilah pemaaf, ajak kepada kebaikan, dan berpalinglah dari orang yang tidak bijak.',source:'QS. Al-A’raf: 199',type:'Qur’an'},
        {text:'Ingatlah Tuhanmu dalam hatimu dengan rendah hati, pagi dan petang.',source:'QS. Al-A’raf: 205',type:'Qur’an'},
        {text:'Orang beriman adalah mereka yang hatinya bergetar ketika nama Allah disebut dan imannya bertambah ketika ayat-Nya dibacakan.',source:'QS. Al-Anfal: 2',type:'Qur’an'},
        {text:'Penuhilah seruan Allah dan Rasul ketika diseru kepada sesuatu yang memberi kehidupan.',source:'QS. Al-Anfal: 24',type:'Qur’an'},
        {text:'Jangan berselisih sehingga kamu menjadi lemah dan kehilangan kekuatan; bersabarlah.',source:'QS. Al-Anfal: 46',type:'Qur’an'},
        {text:'Persiapkan kemampuan sebaik yang kamu mampu.',source:'QS. Al-Anfal: 60',type:'Qur’an'},
        {text:'Katakanlah: tidak akan menimpa kami kecuali apa yang telah Allah tetapkan bagi kami.',source:'QS. At-Taubah: 51',type:'Qur’an'},
        {text:'Orang beriman, laki-laki dan perempuan, saling menolong dalam kebaikan.',source:'QS. At-Taubah: 71',type:'Qur’an'},
        {text:'Bersamalah dengan orang-orang yang benar.',source:'QS. At-Taubah: 119',type:'Qur’an'},
        {text:'Telah datang kepadamu seorang Rasul yang sangat menginginkan kebaikan bagimu, penyantun dan penyayang kepada orang beriman.',source:'QS. At-Taubah: 128',type:'Qur’an'},
        {text:'Telah datang kepadamu pelajaran dari Tuhanmu, penyembuh bagi yang ada di dalam dada, petunjuk, dan rahmat.',source:'QS. Yunus: 57',type:'Qur’an'},
        {text:'Wali-wali Allah tidak merasa takut dan tidak bersedih hati.',source:'QS. Yunus: 62',type:'Qur’an'},
        {text:'Tidak ada satu makhluk melata pun melainkan Allah yang menjamin rezekinya.',source:'QS. Hud: 6',type:'Qur’an'},
        {text:'Aku hanya bermaksud memperbaiki semampuku; keberhasilanku hanya dengan pertolongan Allah.',source:'QS. Hud: 88',type:'Qur’an'},
        {text:'Kebaikan-kebaikan menghapus keburukan-keburukan.',source:'QS. Hud: 114',type:'Qur’an'},
        {text:'Bersabarlah; Allah tidak menyia-nyiakan pahala orang yang berbuat baik.',source:'QS. Hud: 115',type:'Qur’an'},
        {text:'Kesabaran yang indah adalah pilihan, dan kepada Allah tempat memohon pertolongan.',source:'QS. Yusuf: 18',type:'Qur’an'},
        {text:'Aku hanya mengadukan kesusahan dan kesedihanku kepada Allah.',source:'QS. Yusuf: 86',type:'Qur’an'},
        {text:'Jangan berputus asa dari rahmat Allah.',source:'QS. Yusuf: 87',type:'Qur’an'},
        {text:'Siapa bertakwa dan bersabar, Allah tidak menyia-nyiakan pahala orang yang berbuat baik.',source:'QS. Yusuf: 90',type:'Qur’an'},
        {text:'Allah tidak mengubah keadaan suatu kaum sampai mereka mengubah apa yang ada pada diri mereka.',source:'QS. Ar-Ra’d: 11',type:'Qur’an'},
        {text:'Hanya dengan mengingat Allah hati menjadi tenteram.',source:'QS. Ar-Ra’d: 28',type:'Qur’an'},
        {text:'Jika kamu bersyukur, niscaya Aku akan menambah nikmat kepadamu.',source:'QS. Ibrahim: 7',type:'Qur’an'},
        {text:'Perkataan yang baik seperti pohon yang baik: akarnya kuat dan cabangnya menjulang.',source:'QS. Ibrahim: 24-25',type:'Qur’an'},
        {text:'Ya Tuhanku, jadikanlah aku dan keturunanku orang yang tetap mendirikan salat.',source:'QS. Ibrahim: 40',type:'Qur’an'},
        {text:'Bertanyalah kepada orang yang mempunyai pengetahuan jika kamu tidak mengetahui.',source:'QS. An-Nahl: 43',type:'Qur’an'},
        {text:'Allah menyuruh berlaku adil, berbuat kebajikan, dan memberi kepada kerabat.',source:'QS. An-Nahl: 90',type:'Qur’an'},
        {text:'Siapa beramal saleh dalam keadaan beriman akan diberi kehidupan yang baik.',source:'QS. An-Nahl: 97',type:'Qur’an'},
        {text:'Ajaklah ke jalan Tuhanmu dengan hikmah dan nasihat yang baik.',source:'QS. An-Nahl: 125',type:'Qur’an'},
        {text:'Allah bersama orang-orang yang bertakwa dan orang-orang yang berbuat kebaikan.',source:'QS. An-Nahl: 128',type:'Qur’an'},
        {text:'Jangan mengatakan “ah” kepada orang tua; ucapkanlah kepada mereka perkataan yang mulia.',source:'QS. Al-Isra: 23',type:'Qur’an'},
        {text:'Rendahkanlah dirimu kepada kedua orang tua dengan penuh kasih sayang dan doakan mereka.',source:'QS. Al-Isra: 24',type:'Qur’an'},
        {text:'Jangan boros; orang yang boros adalah saudara setan.',source:'QS. Al-Isra: 26-27',type:'Qur’an'},
        {text:'Jangan mengikuti sesuatu yang tidak kamu ketahui; pendengaran, penglihatan, dan hati akan dimintai pertanggungjawaban.',source:'QS. Al-Isra: 36',type:'Qur’an'},
        {text:'Jangan berjalan di bumi dengan sombong.',source:'QS. Al-Isra: 37',type:'Qur’an'},
        {text:'Katakanlah kepada hamba-hamba-Ku agar mengucapkan perkataan yang terbaik.',source:'QS. Al-Isra: 53',type:'Qur’an'},
        {text:'Sungguh Kami telah memuliakan anak cucu Adam.',source:'QS. Al-Isra: 70',type:'Qur’an'},
        {text:'Al-Qur’an diturunkan sebagai penawar dan rahmat bagi orang-orang beriman.',source:'QS. Al-Isra: 82',type:'Qur’an'},
        {text:'Ya Tuhan kami, berilah kami rahmat dari sisi-Mu dan sempurnakan petunjuk bagi urusan kami.',source:'QS. Al-Kahf: 10',type:'Qur’an'},
        {text:'Harta dan anak adalah perhiasan dunia, tetapi amal saleh yang kekal lebih baik di sisi Tuhanmu.',source:'QS. Al-Kahf: 46',type:'Qur’an'},
        {text:'Siapa berharap bertemu Tuhannya, hendaklah beramal saleh dan tidak mempersekutukan-Nya dalam ibadah.',source:'QS. Al-Kahf: 110',type:'Qur’an'},
        {text:'Orang-orang yang beriman dan beramal saleh akan dianugerahi kasih sayang oleh Allah Yang Maha Pengasih.',source:'QS. Maryam: 96',type:'Qur’an'},
        {text:'Ya Tuhanku, lapangkanlah dadaku, mudahkan urusanku, dan lepaskan kekakuan dari lidahku.',source:'QS. Taha: 25-28',type:'Qur’an'},
        {text:'Ya Tuhanku, tambahkanlah kepadaku ilmu.',source:'QS. Taha: 114',type:'Qur’an'},
        {text:'Kami mengutusmu sebagai rahmat bagi seluruh alam.',source:'QS. Al-Anbiya: 107',type:'Qur’an'},
        {text:'Rukuklah, sujudlah, sembahlah Tuhanmu, dan berbuatlah kebaikan agar kamu beruntung.',source:'QS. Al-Hajj: 77',type:'Qur’an'},
        {text:'Sungguh beruntung orang beriman yang khusyuk dalam salatnya.',source:'QS. Al-Mu’minun: 1-2',type:'Qur’an'},
        {text:'Orang beriman memelihara amanah dan janjinya.',source:'QS. Al-Mu’minun: 8',type:'Qur’an'},
        {text:'Hendaklah mereka memaafkan dan berlapang dada; tidakkah kamu ingin Allah mengampunimu?',source:'QS. An-Nur: 22',type:'Qur’an'},
        {text:'Allah adalah cahaya langit dan bumi.',source:'QS. An-Nur: 35',type:'Qur’an'},
        {text:'Hamba Tuhan Yang Maha Pengasih berjalan di bumi dengan rendah hati dan membalas ucapan kasar dengan salam.',source:'QS. Al-Furqan: 63',type:'Qur’an'},
        {text:'Ya Tuhan kami, anugerahkanlah pasangan dan keturunan yang menyejukkan mata serta jadikan kami teladan bagi orang bertakwa.',source:'QS. Al-Furqan: 74',type:'Qur’an'},
        {text:'Ketika aku sakit, Dialah yang menyembuhkanku.',source:'QS. Ash-Shu’ara: 80',type:'Qur’an'},
        {text:'Ya Tuhanku, ilhamkanlah aku untuk mensyukuri nikmat-Mu dan mengerjakan amal saleh yang Engkau ridai.',source:'QS. An-Naml: 19',type:'Qur’an'},
        {text:'Carilah kebahagiaan akhirat dengan karunia yang Allah berikan, tetapi jangan lupakan bagianmu di dunia; berbuat baiklah.',source:'QS. Al-Qasas: 77',type:'Qur’an'},
        {text:'Salat mencegah dari perbuatan keji dan mungkar.',source:'QS. Al-Ankabut: 45',type:'Qur’an'},
        {text:'Orang-orang yang bersungguh-sungguh di jalan Kami akan Kami tunjukkan jalan-jalan Kami.',source:'QS. Al-Ankabut: 69',type:'Qur’an'},
        {text:'Siapa bersyukur, sesungguhnya ia bersyukur untuk dirinya sendiri.',source:'QS. Luqman: 12',type:'Qur’an'},
        {text:'Dirikan salat, ajak kepada kebaikan, cegah kemungkaran, dan bersabarlah atas apa yang menimpamu.',source:'QS. Luqman: 17',type:'Qur’an'},
        {text:'Jangan memalingkan wajah dari manusia karena sombong dan jangan berjalan di bumi dengan angkuh.',source:'QS. Luqman: 18',type:'Qur’an'},
        {text:'Sederhanalah dalam berjalan dan lunakkanlah suaramu.',source:'QS. Luqman: 19',type:'Qur’an'},
        {text:'Lambung mereka jauh dari tempat tidur karena berdoa kepada Tuhan dengan rasa takut dan harap.',source:'QS. As-Sajdah: 16',type:'Qur’an'},
        {text:'Pada diri Rasulullah terdapat teladan yang baik bagi orang yang mengharap Allah dan hari akhir.',source:'QS. Al-Ahzab: 21',type:'Qur’an'},
        {text:'Ingatlah Allah dengan zikir yang banyak.',source:'QS. Al-Ahzab: 41',type:'Qur’an'},
        {text:'Bertakwalah kepada Allah dan ucapkanlah perkataan yang benar.',source:'QS. Al-Ahzab: 70',type:'Qur’an'},
        {text:'Bekerjalah, karena keluarga Dawud diperintah untuk bersyukur dengan amal.',source:'QS. Saba: 13',type:'Qur’an'},
        {text:'Di antara hamba-hamba Allah, yang paling takut kepada-Nya adalah mereka yang berilmu.',source:'QS. Fatir: 28',type:'Qur’an'},
        {text:'Kami mencatat apa yang telah mereka kerjakan dan jejak yang mereka tinggalkan.',source:'QS. Yasin: 12',type:'Qur’an'},
        {text:'Salam, sebagai ucapan dari Tuhan Yang Maha Penyayang.',source:'QS. Yasin: 58',type:'Qur’an'},
        {text:'Apabila Allah menghendaki sesuatu, Dia hanya berkata “Jadilah”, maka jadilah ia.',source:'QS. Yasin: 82',type:'Qur’an'},
        {text:'Apakah sama orang-orang yang mengetahui dengan orang-orang yang tidak mengetahui?',source:'QS. Az-Zumar: 9',type:'Qur’an'},
        {text:'Orang-orang yang sabar akan disempurnakan pahalanya tanpa batas.',source:'QS. Az-Zumar: 10',type:'Qur’an'},
        {text:'Jangan berputus asa dari rahmat Allah; Allah mengampuni dosa-dosa.',source:'QS. Az-Zumar: 53',type:'Qur’an'},
        {text:'Berdoalah kepada-Ku, niscaya Aku perkenankan bagimu.',source:'QS. Ghafir: 60',type:'Qur’an'},
        {text:'Tolaklah keburukan dengan cara yang lebih baik.',source:'QS. Fussilat: 34',type:'Qur’an'},
        {text:'Urusan orang beriman diputuskan dengan musyawarah di antara mereka.',source:'QS. Ash-Shura: 38',type:'Qur’an'},
        {text:'Siapa bersabar dan memaafkan, sungguh itu termasuk perkara yang utama.',source:'QS. Ash-Shura: 43',type:'Qur’an'},
        {text:'Rahmat Tuhanmu lebih baik daripada apa yang mereka kumpulkan.',source:'QS. Az-Zukhruf: 32',type:'Qur’an'},
        {text:'Sesungguhnya orang-orang beriman itu bersaudara; damaikanlah antara saudaramu.',source:'QS. Al-Hujurat: 10',type:'Qur’an'},
        {text:'Jangan suatu kelompok merendahkan kelompok yang lain; boleh jadi mereka lebih baik.',source:'QS. Al-Hujurat: 11',type:'Qur’an'},
        {text:'Jauhilah banyak prasangka, jangan mencari-cari kesalahan, dan jangan menggunjing.',source:'QS. Al-Hujurat: 12',type:'Qur’an'},
        {text:'Yang paling mulia di sisi Allah adalah yang paling bertakwa.',source:'QS. Al-Hujurat: 13',type:'Qur’an'},
        {text:'Kami lebih dekat kepadanya daripada urat lehernya.',source:'QS. Qaf: 16',type:'Qur’an'},
        {text:'Tidak satu kata pun diucapkan melainkan ada pengawas yang selalu siap mencatat.',source:'QS. Qaf: 18',type:'Qur’an'},
        {text:'Aku tidak menciptakan jin dan manusia melainkan agar mereka beribadah kepada-Ku.',source:'QS. Adz-Dzariyat: 56',type:'Qur’an'},
        {text:'Manusia tidak memperoleh selain apa yang telah diusahakannya.',source:'QS. An-Najm: 39',type:'Qur’an'},
        {text:'Jangan terlalu bersedih atas apa yang luput dan jangan terlalu membanggakan apa yang diberikan.',source:'QS. Al-Hadid: 23',type:'Qur’an'},
        {text:'Allah meninggikan orang-orang beriman dan orang-orang yang diberi ilmu beberapa derajat.',source:'QS. Al-Mujadilah: 11',type:'Qur’an'},
        {text:'Wahai orang beriman, bertakwalah dan hendaklah setiap diri memperhatikan apa yang telah dipersiapkan untuk hari esok.',source:'QS. Al-Hashr: 18',type:'Qur’an'},
        {text:'Jangan mengatakan apa yang tidak kamu kerjakan.',source:'QS. As-Saff: 2-3',type:'Qur’an'},
        {text:'Bertakwalah kepada Allah semampumu, dengarkan, taat, dan berinfaklah untuk kebaikan dirimu.',source:'QS. At-Taghabun: 16',type:'Qur’an'},
        {text:'Siapa bertakwa kepada Allah, Dia akan memberinya jalan keluar.',source:'QS. At-Talaq: 2',type:'Qur’an'},
        {text:'Siapa bertawakal kepada Allah, niscaya Allah mencukupkannya.',source:'QS. At-Talaq: 3',type:'Qur’an'},
        {text:'Allah tidak membebani seseorang melainkan sesuai dengan apa yang Allah berikan kepadanya.',source:'QS. At-Talaq: 7',type:'Qur’an'},
        {text:'Peliharalah dirimu dan keluargamu dari api neraka.',source:'QS. At-Tahrim: 6',type:'Qur’an'},
        {text:'Allah menciptakan hidup dan mati untuk menguji siapa yang paling baik amalnya.',source:'QS. Al-Mulk: 2',type:'Qur’an'},
        {text:'Berjalanlah di penjuru bumi dan makanlah dari rezeki-Nya.',source:'QS. Al-Mulk: 15',type:'Qur’an'},
        {text:'Sungguh engkau memiliki budi pekerti yang agung.',source:'QS. Al-Qalam: 4',type:'Qur’an'},
        {text:'Setiap orang bertanggung jawab atas apa yang telah diperbuatnya.',source:'QS. Al-Muddatsir: 38',type:'Qur’an'},
        {text:'Sesungguhnya manusia menjadi saksi atas dirinya sendiri.',source:'QS. Al-Qiyamah: 14',type:'Qur’an'},
        {text:'Kami telah menunjukkan kepadanya jalan; ada yang bersyukur dan ada yang kufur.',source:'QS. Al-Insan: 3',type:'Qur’an'},
        {text:'Kami memberi makan hanya mengharap rida Allah; kami tidak menghendaki balasan atau terima kasih.',source:'QS. Al-Insan: 9',type:'Qur’an'},
        {text:'Beruntunglah orang yang menyucikan diri, mengingat nama Tuhannya, lalu salat.',source:'QS. Al-A’la: 14-15',type:'Qur’an'},
        {text:'Maka berilah peringatan; sesungguhnya tugasmu adalah memberi peringatan.',source:'QS. Al-Ghasyiyah: 21',type:'Qur’an'},
        {text:'Wahai jiwa yang tenang, kembalilah kepada Tuhanmu dengan hati yang rida dan diridai.',source:'QS. Al-Fajr: 27-28',type:'Qur’an'},
        {text:'Tuhanmu kelak akan memberikan karunia kepadamu hingga engkau rida.',source:'QS. Ad-Duha: 5',type:'Qur’an'},
        {text:'Terhadap anak yatim jangan berlaku sewenang-wenang, dan terhadap orang yang meminta jangan menghardik.',source:'QS. Ad-Duha: 9-10',type:'Qur’an'},
        {text:'Terhadap nikmat Tuhanmu, hendaklah engkau menyebut-nyebutnya dengan syukur.',source:'QS. Ad-Duha: 11',type:'Qur’an'},
        {text:'Sesungguhnya bersama kesulitan ada kemudahan.',source:'QS. Al-Insyirah: 5-6',type:'Qur’an'},
        {text:'Apabila engkau telah selesai dari suatu urusan, tetaplah bersungguh-sungguh pada urusan berikutnya.',source:'QS. Al-Insyirah: 7',type:'Qur’an'},
        {text:'Hanya kepada Tuhanmu hendaknya engkau berharap.',source:'QS. Al-Insyirah: 8',type:'Qur’an'},
        {text:'Sungguh Kami telah menciptakan manusia dalam bentuk yang sebaik-baiknya.',source:'QS. At-Tin: 4',type:'Qur’an'},
        {text:'Orang yang beriman dan beramal saleh mendapat pahala yang tidak putus-putus.',source:'QS. At-Tin: 6',type:'Qur’an'},
        {text:'Bacalah dengan nama Tuhanmu yang menciptakan.',source:'QS. Al-‘Alaq: 1',type:'Qur’an'},
        {text:'Allah mengajarkan manusia apa yang tidak diketahuinya.',source:'QS. Al-‘Alaq: 5',type:'Qur’an'},
        {text:'Malam kemuliaan lebih baik daripada seribu bulan.',source:'QS. Al-Qadr: 3',type:'Qur’an'},
        {text:'Siapa mengerjakan kebaikan seberat zarrah akan melihat balasannya.',source:'QS. Az-Zalzalah: 7',type:'Qur’an'},
        {text:'Siapa mengerjakan keburukan seberat zarrah akan melihat balasannya.',source:'QS. Az-Zalzalah: 8',type:'Qur’an'},
        {text:'Demi masa, manusia berada dalam kerugian kecuali yang beriman, beramal saleh, dan saling menasihati dalam kebenaran serta kesabaran.',source:'QS. Al-‘Asr: 1-3',type:'Qur’an'},
        {text:'Sebaik-baik kalian adalah yang belajar Al-Qur’an dan mengajarkannya.',source:'HR. Bukhari',type:'Hadis'},
        {text:'Sesungguhnya setiap amal bergantung pada niatnya.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Siapa beriman kepada Allah dan hari akhir, hendaklah berkata baik atau diam.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Permudahlah dan jangan mempersulit; berilah kabar gembira dan jangan membuat orang menjauh.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Kelembutan tidak ada pada sesuatu kecuali akan menghiasinya.',source:'HR. Muslim',type:'Hadis'},
        {text:'Mukmin yang kuat lebih baik dan lebih dicintai Allah daripada mukmin yang lemah, dan pada keduanya ada kebaikan.',source:'HR. Muslim',type:'Hadis'},
        {text:'Siapa menempuh jalan untuk mencari ilmu, Allah mudahkan baginya jalan menuju surga.',source:'HR. Muslim',type:'Hadis'},
        {text:'Bacalah Al-Qur’an, karena ia akan datang pada hari kiamat memberi syafaat bagi pembacanya.',source:'HR. Muslim',type:'Hadis'},
        {text:'Allah tidak melihat rupa dan harta kalian, tetapi melihat hati dan amal kalian.',source:'HR. Muslim',type:'Hadis'},
        {text:'Sedekah tidak mengurangi harta.',source:'HR. Muslim',type:'Hadis'},
        {text:'Amal yang paling dicintai Allah adalah yang paling konsisten, meskipun sedikit.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Seorang Muslim adalah orang yang kaum Muslimin selamat dari lisan dan tangannya.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Orang kuat bukanlah yang menang bergulat, tetapi yang mampu mengendalikan diri ketika marah.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Rasa malu adalah bagian dari iman.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Seorang mukmin bagi mukmin lainnya seperti bangunan yang saling menguatkan.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Allah akan menolong seorang hamba selama hamba itu menolong saudaranya.',source:'HR. Muslim',type:'Hadis'},
        {text:'Tidak sempurna iman seseorang sampai ia mencintai untuk saudaranya apa yang ia cintai untuk dirinya sendiri.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Dua nikmat yang banyak manusia tertipu padanya: kesehatan dan waktu luang.',source:'HR. Bukhari',type:'Hadis'},
        {text:'Siapa tidak menyayangi, tidak akan disayangi.',source:'HR. Bukhari dan Muslim',type:'Hadis'},
        {text:'Sebarkanlah salam di antara kalian.',source:'HR. Muslim',type:'Hadis'},
        {text:'Allah itu Maha Indah dan mencintai keindahan.',source:'HR. Muslim',type:'Hadis'},
        {text:'Sesungguhnya Allah telah menetapkan ihsan pada segala sesuatu.',source:'HR. Muslim',type:'Hadis'},
        {text:'Tidak ada sesuatu yang lebih berat dalam timbangan seorang mukmin pada hari kiamat daripada akhlak yang baik.',source:'HR. Tirmidzi',type:'Hadis'},
        {text:'Senyummu kepada saudaramu adalah sedekah.',source:'HR. Tirmidzi',type:'Hadis'}
    ];

    const tz = 'Asia/Jakarta';
    const safeStorage = {
        get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
    };

    function jakartaDateParts(date = new Date()) {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(date).reduce((acc, part) => (acc[part.type] = part.value, acc), {});
        return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), key: `${parts.year}-${parts.month}-${parts.day}` };
    }

    function dayOfYear(date = new Date()) {
        const p = jakartaDateParts(date);
        return Math.floor((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 0)) / 86400000);
    }

    function hashText(value) {
        let hash = 2166136261;
        for (const ch of String(value || '')) {
            hash ^= ch.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function daily(offset = 0, date = new Date()) {
        const p = jakartaDateParts(date);
        const index = (p.year * 17 + dayOfYear(date) * 7 + Number(offset || 0)) % QUOTES.length;
        return QUOTES[(index + QUOTES.length) % QUOTES.length];
    }

    function loader(context = 'loader') {
        const p = jakartaDateParts();
        const storageKey = `gm_quote_cursor_${context}`;
        const state = (() => { try { return JSON.parse(safeStorage.get(storageKey) || '{}'); } catch (_) { return {}; } })();
        const cursor = state.date === p.key ? Number(state.cursor || 0) : 0;
        const start = (p.year * 29 + dayOfYear() * 11 + hashText(context)) % QUOTES.length;
        const index = (start + cursor * 17) % QUOTES.length;
        safeStorage.set(storageKey, JSON.stringify({ date: p.key, cursor: (cursor + 1) % QUOTES.length }));
        return QUOTES[index];
    }

    function sequence(context = 'maintenance', count = QUOTES.length) {
        const start = (dayOfYear() * 13 + hashText(context)) % QUOTES.length;
        const step = 17;
        const out = [];
        const seen = new Set();
        for (let i = 0; i < Math.min(count, QUOTES.length); i++) {
            const idx = (start + i * step) % QUOTES.length;
            if (!seen.has(idx)) { seen.add(idx); out.push(QUOTES[idx]); }
        }
        return out;
    }

    function mountLoader(root = document, context) {
        const quote = loader(context || document.body?.dataset?.quoteContext || location.pathname || 'loader');
        const textNode = root.querySelector?.('[data-loader-quote-text]');
        const sourceNode = root.querySelector?.('[data-loader-quote-source]');
        const typeNode = root.querySelector?.('[data-loader-quote-type]');
        if (textNode) textNode.textContent = quote.text;
        if (sourceNode) sourceNode.textContent = quote.source;
        if (typeNode) typeNode.textContent = quote.type;
        return quote;
    }

    function remainingMinimum(startedAt, minimumMs = 5000) {
        const start = Number(startedAt || 0);
        return Math.max(0, Number(minimumMs || 0) - (performance.now() - start));
    }

    function waitForMinimum(startedAt, minimumMs = 5000) {
        const wait = remainingMinimum(startedAt, minimumMs);
        return wait > 0 ? new Promise(resolve => setTimeout(resolve, wait)) : Promise.resolve();
    }

    window.GMIslamicQuotes = Object.freeze({
        all: QUOTES.slice(),
        count: QUOTES.length,
        daily,
        loader,
        sequence,
        mountLoader,
        waitForMinimum,
        remainingMinimum,
        timeZone: tz
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => mountLoader(document), { once: true });
    } else {
        mountLoader(document);
    }
})();
