// File: utils/asciiBanner.js
import figlet from 'figlet';
import chalk from 'chalk';
import boxen from 'boxen';
import gradient from 'gradient-string';

export function printSubtitle() {


    const subtitle = chalk.hex('#f5a9b8')('ytmp3 ► Convert YouTube to MP3. Effortlessly.');

    const boxedSubtitle = boxen(subtitle, {
        padding: 0.5,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'magenta',
        align: 'center',
    });

    console.log(boxedSubtitle);
}
export function printBannerOnly() {
    const asciiTitle = figlet.textSync("Tune - it", {
        font: 'ANSI Shadow',
        horizontalLayout: 'default',
        verticalLayout: 'default'
    });

    const bannerText = gradient.pastel.multiline(asciiTitle);

    console.log(bannerText);
}

export function printVersion(){
    const asciiVersion = figlet.textSync("v.1.0.0",{
        font: 'ANSI Shadow',
        horizontalLayout:'default',
        verticalLayout:'default'
    });

    const versionText = gradient.retro.multiline(asciiVersion);

    console.log(versionText);
}

export function printHelp() {
    console.log(chalk.bold.magentaBright('\nUsage:'));
    console.log(chalk.whiteBright('  tuneit [command]'));

    console.log(chalk.bold.magentaBright('\nAvailable Commands:'));
    console.log('  add         ' + chalk.gray('Add a video to the download queue'));
    console.log('  proxy       ' + chalk.gray('Add a proxy to the rotator'));
    console.log('  status      ' + chalk.gray('Show current queue and status'));
    console.log('  help        ' + chalk.gray('Display help and usage info'));
    console.log('  version     ' + chalk.gray('Display version info'));

    console.log(chalk.bold.magentaBright('\nFlags:'));
    console.log('  -h, --help  ' + chalk.gray('   Show help info\n'));
    console.log('  -v, --version  ' + chalk.gray('Show version info\n'));
}
