// Tanggal kalender nasional dan cuti bersama menurut SKB tahunan.
export const sources = {
  2026:'https://www.setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026',
  2027:'https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2027'
};
const events = [
  ['Tahun Baru Masehi','01-01','01-01'],
  ['Isra Mikraj','01-16','01-05 12-26'],
  ['Tahun Baru Imlek','02-17','02-06','02-16','02-05'],
  ['Nyepi','03-19','03-08','03-18',''],
  ['Idulfitri','03-21 03-22','03-10 03-11','03-20 03-23 03-24','03-09 03-12 03-15'],
  ['Wafat Yesus Kristus','04-03','03-26','','03-25'],
  ['Paskah','04-05','03-28'],
  ['Hari Buruh','05-01','05-01'],
  ['Kenaikan Yesus Kristus','05-14','05-06','05-15',''],
  ['Iduladha','05-27','05-17','05-28','05-18'],
  ['Waisak','05-31','05-20','','05-19'],
  ['Hari Lahir Pancasila','06-01','06-01'],
  ['Tahun Baru Islam','06-16','06-06'],
  ['Hari Kemerdekaan','08-17','08-17'],
  ['Maulid Nabi Muhammad','08-25','08-15'],
  ['Natal','12-25','12-25','12-24','12-24']
];
export const holidays = new Map();
for (const [name,...columns] of events) {
  columns.forEach((dates,index) => {
    for (const day of dates.split(' ').filter(Boolean)) {
      holidays.set((2026+index%2)+'-'+day,{name,category:index<2?'Libur nasional':'Cuti bersama'});
    }
  });
}
