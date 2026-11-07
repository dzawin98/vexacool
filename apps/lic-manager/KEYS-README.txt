KUNCI PRIVAT TIDAK DISALIN OTOMATIS.

Folder ini berisi keys/public.pem + keys/key-info.json saja. Untuk menerbitkan lisensi
di server ini, salin sendiri file:

    D:\VEXAlicmanager\keys\private.pem   ->   /opt/vexapacs/apps/lic-manager/keys/private.pem
    lalu: chmod 600, chown root:root

Pertimbangan keamanan: private.pem bisa menandatangani lisensi untuk mesin mana pun.
Kalau penerbitan lisensi tetap dilakukan di mesin Windows (D:\VEXAlicmanager), server
Linux ini cukup menerima license.lic — jangan menaruh private key di server rumah sakit.
